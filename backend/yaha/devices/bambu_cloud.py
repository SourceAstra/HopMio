"""拓竹云打印驱动：HTTPS 认证、设备绑定、切片 3MF 预签名直传与 MQTT TLS 遥测控制。"""

import hashlib
import json
import logging
import ssl
import threading
import time
from pathlib import Path
import httpx
import paho.mqtt.client as mqtt
from ..contracts import DomainError

logger = logging.getLogger("yaha.bambu")

SERVERS = {
    "cn": {
        "api": "https://api.bambulab.cn",
        "mqtt": "cn.mqtt.bambulab.com",
    },
    "global": {
        "api": "https://api.bambulab.com",
        "mqtt": "us.mqtt.bambulab.com",
    },
}


class BambuCloudDriver:
    def __init__(self, db):
        self.db = db
        self.lock = threading.Lock()
        self.client: mqtt.Client | None = None
        self.region = "cn"
        self.selected_dev_id: str | None = None
        self.telemetry = {
            "online": False,
            "connected": False,
            "gcode_state": "IDLE",
            "progress_percent": 0,
            "remaining_minutes": 0,
            "nozzle_temper": 0.0,
            "nozzle_target": 0.0,
            "bed_temper": 0.0,
            "bed_target": 0.0,
            "layer_num": 0,
            "total_layers": 0,
            "subtask_name": "",
            "last_seen": 0,
        }
        self._init_from_storage()

    def _init_from_storage(self):
        saved = self.db.get("settings", "bambu_config") or {}
        self.region = saved.get("region", "cn")
        self.selected_dev_id = saved.get("selected_dev_id")
        token = saved.get("access_token")
        uid = saved.get("uid")
        if token and uid and self.selected_dev_id:
            threading.Thread(target=self._start_mqtt, args=(uid, token), daemon=True).start()

    def _api_url(self, path: str) -> str:
        base = SERVERS.get(self.region, SERVERS["cn"])["api"]
        return f"{base.rstrip('/')}/{path.lstrip('/')}"

    def _mqtt_host(self) -> str:
        return SERVERS.get(self.region, SERVERS["cn"])["mqtt"]

    def login(self, account: str, password: str, code: str | None = None, region: str = "cn"):
        self.region = region if region in SERVERS else "cn"
        url = self._api_url("/v1/user-service/user/login")
        payload = {"account": account, "password": password}
        if code:
            payload["code"] = code

        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.post(url, json=payload)
                data = res.json()
        except Exception as e:
            raise DomainError(f"连接拓竹云服务失败：{e}", "BAMBU_NETWORK")

        # 处理 2FA 验证码情况
        if res.status_code != 200 or not data.get("accessToken"):
            msg = data.get("message") or "拓竹账号或密码错误"
            if "verification" in msg.lower() or "code" in msg.lower() or data.get("code") == 4001:
                return {
                    "success": False,
                    "needs_code": True,
                    "message": "请输入拓竹发送至您邮箱的安全验证码",
                }
            raise DomainError(f"拓竹登录失败：{msg}", "BAMBU_AUTH_FAILED")

        access_token = data["accessToken"]
        uid = str(data.get("uid") or "")
        username = data.get("username") or account

        saved = self.db.get("settings", "bambu_config") or {}
        saved.update({
            "account": account,
            "region": self.region,
            "access_token": access_token,
            "uid": uid,
            "username": username,
            "updated_at": int(time.time()),
        })
        self.db.put("settings", "bambu_config", saved)

        devices = self.list_devices()
        if devices and not self.selected_dev_id:
            self.select_device(devices[0]["dev_id"])

        return {
            "success": True,
            "username": username,
            "devices": devices,
        }

    def list_devices(self):
        saved = self.db.get("settings", "bambu_config") or {}
        token = saved.get("access_token")
        if not token:
            return []

        url = self._api_url("/v1/iot-service/api/user/bind")
        headers = {"Authorization": f"Bearer {token}"}
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.get(url, headers=headers)
                if res.status_code == 401:
                    return []
                data = res.json()
        except Exception as e:
            logger.warning("拉取拓竹设备列表异常: %s", e)
            return []

        devices = []
        for d in data.get("devices", []):
            dev_id = d.get("dev_id")
            if not dev_id:
                continue
            devices.append({
                "dev_id": dev_id,
                "name": d.get("name") or d.get("dev_model_name") or dev_id,
                "model": d.get("dev_model_name") or "Bambu 3D Printer",
                "online": bool(d.get("online")),
                "selected": dev_id == self.selected_dev_id,
            })
        return devices

    def select_device(self, dev_id: str):
        saved = self.db.get("settings", "bambu_config") or {}
        saved["selected_dev_id"] = dev_id
        self.db.put("settings", "bambu_config", saved)
        self.selected_dev_id = dev_id

        token = saved.get("access_token")
        uid = saved.get("uid")
        if token and uid:
            self._start_mqtt(uid, token)

    def _start_mqtt(self, uid: str, token: str):
        with self.lock:
            if self.client:
                try:
                    self.client.disconnect()
                except Exception:
                    pass
                self.client = None

            if not self.selected_dev_id:
                return

            client_id = f"yaha_{uid}_{int(time.time())}"
            client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=client_id,
                protocol=mqtt.MQTTv311,
            )
            client.username_pw_set(uid, token)

            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            client.tls_set_context(context)

            def on_connect(c, userdata, flags, rc, properties=None):
                if rc == 0:
                    with self.lock:
                        self.telemetry["connected"] = True
                    topic = f"device/{self.selected_dev_id}/report"
                    c.subscribe(topic)
                else:
                    with self.lock:
                        self.telemetry["connected"] = False

            def on_disconnect(c, userdata, disconnect_flags, rc, properties=None):
                with self.lock:
                    self.telemetry["connected"] = False

            def on_message(c, userdata, msg):
                try:
                    payload = json.loads(msg.payload.decode("utf-8"))
                    print_info = payload.get("print", {})
                    if not print_info:
                        return
                    with self.lock:
                        self.telemetry["last_seen"] = int(time.time())
                        if "gcode_state" in print_info:
                            self.telemetry["gcode_state"] = print_info["gcode_state"]
                        if "mc_percent" in print_info:
                            self.telemetry["progress_percent"] = int(print_info["mc_percent"])
                        if "mc_remaining_time" in print_info:
                            self.telemetry["remaining_minutes"] = int(print_info["mc_remaining_time"])
                        if "nozzle_temper" in print_info:
                            self.telemetry["nozzle_temper"] = round(float(print_info["nozzle_temper"]), 1)
                        if "nozzle_target_temper" in print_info:
                            self.telemetry["nozzle_target"] = round(float(print_info["nozzle_target_temper"]), 1)
                        if "bed_temper" in print_info:
                            self.telemetry["bed_temper"] = round(float(print_info["bed_temper"]), 1)
                        if "bed_target_temper" in print_info:
                            self.telemetry["bed_target"] = round(float(print_info["bed_target_temper"]), 1)
                        if "layer_num" in print_info:
                            self.telemetry["layer_num"] = int(print_info["layer_num"])
                        if "total_layer_num" in print_info:
                            self.telemetry["total_layers"] = int(print_info["total_layer_num"])
                        if "subtask_name" in print_info:
                            self.telemetry["subtask_name"] = str(print_info["subtask_name"])
                except Exception as e:
                    logger.debug("解析 MQTT 报文异常: %s", e)

            client.on_connect = on_connect
            client.on_disconnect = on_disconnect
            client.on_message = on_message

            try:
                client.connect_async(self._mqtt_host(), 8883, keepalive=60)
                client.loop_start()
                self.client = client
            except Exception as e:
                logger.warning("启动拓竹 MQTT 连接失败: %s", e)

    def print_project(self, gcode_3mf_path: Path, filename: str):
        if not self.selected_dev_id:
            raise DomainError("请先在设置中选择要发送的拓竹打印机。", "BAMBU_NO_DEVICE")
        saved = self.db.get("settings", "bambu_config") or {}
        token = saved.get("access_token")
        if not token:
            raise DomainError("拓竹账号未登录或已过期，请在设置中重新登录。", "BAMBU_AUTH_EXPIRED")

        content = gcode_3mf_path.read_bytes()
        md5_hash = hashlib.md5(content).hexdigest()

        # 1. 向拓竹申请预签名上传 URL
        url = self._api_url("/v1/iot-service/api/user/project/file")
        headers = {"Authorization": f"Bearer {token}"}
        try:
            with httpx.Client(timeout=15.0) as http_client:
                res = http_client.post(url, json={"filename": filename}, headers=headers)
                data = res.json()
        except Exception as e:
            raise DomainError(f"请求拓竹云上传授权失败：{e}", "BAMBU_UPLOAD_AUTH")

        upload_url = data.get("upload_url") or data.get("uploadUrl")
        file_url = data.get("url") or data.get("file_url")
        if not upload_url or not file_url:
            raise DomainError("未能取得拓竹云存储上传链接，请稍后重试。", "BAMBU_UPLOAD_URL")

        # 2. 上传文件到预签名 URL
        try:
            with httpx.Client(timeout=60.0) as http_client:
                put_res = http_client.put(upload_url, content=content, headers={"Content-Type": "application/octet-stream"})
                if put_res.status_code not in (200, 201):
                    raise DomainError(f"切片文件上传拓竹云失败（HTTP {put_res.status_code}）", "BAMBU_UPLOAD_FAILED")
        except Exception as e:
            raise DomainError(f"切片文件上传失败：{e}", "BAMBU_UPLOAD_FAILED")

        # 3. 通过 MQTT 下发打印指令
        with self.lock:
            client = self.client
        if not client or not self.telemetry.get("connected"):
            # 尝试应急重连
            self._start_mqtt(saved.get("uid", ""), token)
            time.sleep(1.0)
            with self.lock:
                client = self.client

        if not client:
            raise DomainError("尚未与拓竹打印机建立实时云信道，请检查设备是否在线。", "BAMBU_OFFLINE")

        task_payload = {
            "print": {
                "command": "project_file",
                "param": "Metadata/plate_1.gcode",
                "url": file_url,
                "md5": md5_hash,
                "profile_id": "0",
                "project_id": "0",
                "subtask_id": "0",
                "subtask_name": filename,
                "task_name": filename,
                "sequence_id": str(int(time.time())),
            }
        }
        topic = f"device/{self.selected_dev_id}/request"
        result = client.publish(topic, json.dumps(task_payload))
        result.wait_for_publish(timeout=5.0)

        return {
            "dispatched": True,
            "dev_id": self.selected_dev_id,
            "task_name": filename,
        }

    def control(self, command: str):
        if not self.selected_dev_id or not self.client:
            raise DomainError("打印机未连接。", "BAMBU_OFFLINE")
        valid_cmds = {"pause": "pause", "resume": "resume", "stop": "stop"}
        cmd = valid_cmds.get(command)
        if not cmd:
            raise DomainError("不支持的控制指令。", "BAMBU_CMD_INVALID")

        payload = {
            "print": {
                "command": cmd,
                "sequence_id": str(int(time.time())),
            }
        }
        topic = f"device/{self.selected_dev_id}/request"
        self.client.publish(topic, json.dumps(payload))
        return {"command": cmd, "sent": True}

    def logout(self):
        with self.lock:
            if self.client:
                try:
                    self.client.disconnect()
                except Exception:
                    pass
                self.client = None
            self.telemetry = {
                "online": False,
                "connected": False,
                "gcode_state": "IDLE",
                "progress_percent": 0,
                "remaining_minutes": 0,
                "nozzle_temper": 0.0,
                "nozzle_target": 0.0,
                "bed_temper": 0.0,
                "bed_target": 0.0,
                "layer_num": 0,
                "total_layers": 0,
                "subtask_name": "",
                "last_seen": 0,
            }
            self.selected_dev_id = None
        self.db.delete("settings", "bambu_config")
        return {"success": True}

    def status(self):
        saved = self.db.get("settings", "bambu_config") or {}
        account = saved.get("account")
        with self.lock:
            tele = dict(self.telemetry)
        is_fresh = (int(time.time()) - tele.get("last_seen", 0)) < 45
        return {
            "configured": bool(account and self.selected_dev_id),
            "account": account,
            "selected_dev_id": self.selected_dev_id,
            "online": tele.get("connected") and is_fresh,
            "telemetry": tele,
        }

