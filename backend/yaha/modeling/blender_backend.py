"""Blender 进程边界：有限并发、取消、超时及产物身份检查。"""

import hashlib
import json
import os
import signal
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from .backend import BuildResult
from .runtime import ROOT, availability, runtime
from ..contracts import DomainError


class BlenderBackend:
    def __init__(self):
        self.slot = threading.Semaphore(1)
        self._status = availability()

    def status(self):
        return dict(self._status)

    def build(self, request, inputs, job):
        if not self._status["available"]:
            raise DomainError(self._status["message"], "BLENDER_UNAVAILABLE")
        while not self.slot.acquire(timeout=0.2):
            job.check()
        try:
            job.check()
            return self._execute(request, inputs, job)
        except (OSError, subprocess.SubprocessError, ValueError, KeyError):
            raise DomainError("Blender 进程或输出不完整，请查看建模参数和安装状态。", "BLENDER_OUTPUT") from None
        finally:
            self.slot.release()

    def _execute(self, request, inputs, job):
        config = runtime()
        deadline = min(time.monotonic() + config["timeout_seconds"], request.get("deadline", float("inf")))
        if time.monotonic() >= deadline:
            raise DomainError("建模任务已超过整体时间预算。", "BLENDER_TIMEOUT")
        staging = ROOT / ".artifacts/blender-jobs"
        staging.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=job.id + "-", dir=staging) as temporary:
            directory = Path(temporary)
            payload = dict(request)
            payload["input_files"] = {}
            for name, content in inputs.items():
                path = directory / name
                path.write_bytes(content)
                payload["input_files"][name] = str(path)
                if name in ("input.glb", "input.json"):
                    payload["input_mesh"] = str(path)
            payload.update(job_id=job.id, max_faces=config["max_faces"])
            toolkit = ROOT / "backend/yaha/blender"
            tools = {}
            for source in sorted(toolkit.rglob("*")):
                if source.suffix in (".py", ".stl"):
                    relative = source.relative_to(toolkit)
                    content = source.read_bytes()
                    target = directory / "toolkit" / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(content)
                    tools[relative.as_posix()] = hashlib.sha256(content).hexdigest()
            identity = {"request": request, "inputs": {name: hashlib.sha256(content).hexdigest() for name, content in inputs.items()}, "tools": tools, "blender": self._status["version"]}
            digest = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            payload["plan_digest"] = digest
            plan = directory / "request.json"
            plan.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            command = [config["executable"], "--background", "--factory-startup", "--disable-autoexec", "--offline-mode", "--python-exit-code", "20", "--python", str(directory / "toolkit/driver.py"), "--", "--plan", str(plan), "--output-dir", str(directory)]
            allowed = {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "LANG", "LC_ALL", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR"}
            environment = {key: val for key, val in os.environ.items() if key.upper() in allowed}
            group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
            with (directory / "blender.log").open("wb") as log:
                process = subprocess.Popen(command, cwd=directory, env=environment, stdout=log, stderr=subprocess.STDOUT, **group)
                try:
                    started, last = time.monotonic(), None
                    while process.poll() is None:
                        job.check()
                        if time.monotonic() >= deadline:
                            raise DomainError("Blender 建模超时，上一版本已保留。", "BLENDER_TIMEOUT")
                        progress = directory / "progress.json"
                        if progress.is_file():
                            state = json.loads(progress.read_text(encoding="utf-8"))
                            if state != last:
                                low, high = request.get("progress_range", (0, 100))
                                job.progress(low + state["percent"] / 100 * (high - low), state["stage"])
                                last = state
                        time.sleep(0.1)
                finally:
                    if process.poll() is None:
                        if os.name == "nt":
                            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, timeout=10)
                        else:
                            try:
                                os.killpg(process.pid, signal.SIGKILL)
                            except ProcessLookupError:
                                pass
                        process.wait(timeout=10)
                    job.record(diagnostics={"exit_code": process.returncode, "log": (directory / "blender.log").read_bytes()[-8192:].decode("utf-8", errors="replace")})
            if process.returncode:
                error = directory / "error.json"
                message = json.loads(error.read_text(encoding="utf-8"))["message"] if error.is_file() else "Blender 无法完成建模，请检查系统依赖或方案。"
                raise DomainError(message, "BLENDER_EXECUTION")
            job.check()
            manifest_path = directory / "manifest.json"
            if not manifest_path.is_file():
                raise DomainError("Blender 没有返回完成清单。", "BLENDER_OUTPUT")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("job_id") != job.id or manifest.get("plan_digest") != digest:
                raise DomainError("Blender 产物与当前任务不一致。", "BLENDER_IDENTITY")
            if "Blender " + manifest.get("blender_version", "") != self._status["version"]:
                raise DomainError("执行期间 Blender 版本改变，请重启引擎。", "BLENDER_IDENTITY")
            files = {}
            allowed = {"stl", "glb", "blend", "source_glb", "manufacturing_glb", "comparison", "reference"}
            if not {"stl", "glb", "blend"}.issubset(manifest["outputs"]) or not set(manifest["outputs"]).issubset(allowed):
                raise DomainError("Blender 输出角色无效。", "BLENDER_IDENTITY")
            for role, descriptor in manifest["outputs"].items():
                filename = descriptor.get("file", "model." + role)
                if Path(filename).name != filename:
                    raise DomainError("Blender 输出路径无效。", "BLENDER_IDENTITY")
                path = directory / filename
                if not path.is_file() or not 0 < path.stat().st_size <= config["max_output_mb"] * 1024 * 1024:
                    raise DomainError("Blender 输出缺失或超过文件预算。", "BLENDER_OUTPUT")
                files[role] = path.read_bytes()
                if hashlib.sha256(files[role]).hexdigest() != descriptor["sha256"]:
                    raise DomainError("Blender 文件摘要不一致。", "BLENDER_IDENTITY")
            manifest["identity"] = identity
            private = {}
            for name, filename in manifest.pop("private_outputs", {}).items():
                if name != "body" or filename != "shape-body.json":
                    raise DomainError("私有造型数据角色不支持。", "BLENDER_IDENTITY")
                path = directory / filename
                if not path.is_file() or not 0 < path.stat().st_size <= config["max_output_mb"] * 1024 * 1024:
                    raise DomainError("私有造型数据超出预算。", "BLENDER_OUTPUT")
                private[name] = path.read_bytes()
            return BuildResult(files, manifest, private)
