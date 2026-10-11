"""Meshy 实际任务协议；提交失败不自动重复扣费。"""

import time
import httpx
from ..contracts import DomainError, Mode

BASE = "https://api.meshy.ai"


class Meshy:
    def __init__(self, settings, assets):
        self.settings = settings
        self.assets = assets

    def request(self, method, path, body=None):
        try:
            with httpx.Client(timeout=60, follow_redirects=False) as client:
                response = client.request(
                    method,
                    BASE + path,
                    headers={"Authorization": "Bearer " + self.settings.key("meshy")},
                    json=body,
                )
            if response.status_code >= 400:
                raise DomainError(
                    f"Meshy 请求失败（{response.status_code}），请家长检查账户与额度。",
                    "AI_HTTP_ERROR",
                )
            return response.json()
        except httpx.RequestError:
            raise DomainError(
                "云端连接中断。提交没有自动重试，请先检查 Meshy 的任务记录，避免重复计费。",
                "AI_NETWORK",
            )

    def wait(self, path, job):
        for _ in range(480):
            job.check()
            result = self.request("GET", path)
            job.progress(
                min(90, int(result.get("progress", 0)) * 0.8 + 10),
                "乌萨奇正在等待云端造物",
            )
            status = result.get("status")
            if status == "SUCCEEDED":
                return result
            if status in ("FAILED", "CANCELED"):
                raise DomainError(
                    "云端任务没有完成，请到服务账户查看失败原因。", "AI_FAILED"
                )
            time.sleep(3)
        raise DomainError(
            "云端任务等待超过 24 分钟，请使用记录的任务编号到 Meshy 查看。"
        )

    def generate(self, spec, job, concept=False, resume=None):
        if resume and not (
            self.settings.values()["cloud_enabled"] and self.settings.key("meshy")
        ):
            raise DomainError("请家长启用云端并配置原任务所用的 Meshy 密钥。")
        model = self.settings.values()["meshy_model"]
        if concept:
            path = "/openapi/v1/text-to-image"
            body = {
                "ai_model": "nano-banana-2",
                "prompt": spec.prompt,
                "aspect_ratio": "1:1",
            }
        elif spec.mode == Mode.TEXT:
            path = "/openapi/v2/text-to-3d"
            body = {
                "mode": "preview",
                "prompt": spec.prompt,
                "ai_model": model,
                "target_formats": ["glb", "stl"],
            }
        elif spec.mode == Mode.IMAGE:
            if len(spec.asset_ids) != 1:
                raise DomainError("单图重建需要选择一张图片。")
            path = "/openapi/v1/image-to-3d"
            body = {
                "image_url": self.assets.data_uri(spec.asset_ids[0]),
                "ai_model": model,
                "should_texture": False,
                "target_formats": ["glb", "stl"],
            }
        elif spec.mode == Mode.MULTIVIEW:
            if len(spec.asset_ids) < 2:
                raise DomainError("多视角重建至少需要同一件物品的两张照片。")
            path = "/openapi/v1/multi-image-to-3d"
            body = {
                "image_urls": [self.assets.data_uri(x) for x in spec.asset_ids],
                "ai_model": model,
                "should_texture": False,
                "target_formats": ["glb", "stl"],
            }
        else:
            raise DomainError("这个模式使用本地造物引擎。")
        if not spec.prompt.strip() and spec.mode == Mode.TEXT:
            raise DomainError("先把你的想法告诉乌萨奇。")
        if resume:
            if resume["remote_path"] != path:
                raise DomainError("原任务类型与当前模式不同，不能恢复。")
            identifier = resume["remote_id"]
        else:
            self.settings.reserve_cloud("meshy")
            identifier = self.request("POST", path, body)["result"]
        job.record(remote_id=identifier, remote_path=path)
        result = self.wait(path + "/" + identifier, job)
        url = (
            result["image_urls"][0]
            if concept
            else result["model_urls"].get("stl") or result["model_urls"]["glb"]
        )
        if not url.startswith("https://"):
            raise DomainError("云端返回了无效的下载地址。")
        with httpx.stream("GET", url, timeout=120, follow_redirects=True) as response:
            response.raise_for_status()
            content = bytearray()
            for chunk in response.iter_bytes():
                job.check()
                content.extend(chunk)
                if len(content) > 40 * 1024 * 1024:
                    raise DomainError("云端文件超过 40 MB，请在服务端减面后重新导入。")
        ext = (
            ".png"
            if concept
            else (".stl" if result["model_urls"].get("stl") else ".glb")
        )
        if concept:
            import base64

            return self.assets.upload(
                "云端概念图.png", base64.b64encode(content).decode()
            )
        return self.assets.write(bytes(content), ext, "云端模型" + ext, "model-input")
