"""外部脚本的 OS 边界；只暴露运行库、只读输入与单一输出目录。"""

import json
import math
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from typing import Protocol
from .runtime import ROOT, runtime
from ..contracts import DomainError


class ScriptExecutor(Protocol):
    def status(self) -> dict: ...
    def execute(self, document: dict, source: bytes | None, job) -> bytes: ...


def check_output_budget(directory, max_bytes):
    count, size = 0, 0
    with os.scandir(directory) as entries:
        for entry in entries:
            try:
                info = entry.stat(follow_symlinks=False)
            except FileNotFoundError:
                continue
            if not stat.S_ISREG(info.st_mode):
                raise DomainError("脚本输出目录只允许普通文件。", "SCRIPT_OUTPUT")
            count += 1
            size += info.st_size
            if count > 1024 or size > max_bytes:
                raise DomainError("脚本写入超过任务文件预算，已停止运行。", "SCRIPT_OUTPUT")


class BubblewrapExecutor:
    def status(self):
        available = sys.platform == "linux" and bool(shutil.which("bwrap")) and bool(shutil.which("prlimit"))
        return {"available": available, "message": "本地脚本隔离工具已安装" if available else "脚本执行需要 Linux Bubblewrap 与 prlimit；当前环境尚未配置隔离执行器。"}

    def execute(self, document, source, job):
        status = self.status()
        if not status["available"]:
            raise DomainError(status["message"], "SCRIPT_SANDBOX_UNAVAILABLE")
        config = runtime()
        staging = ROOT / ".artifacts/script-jobs"
        staging.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=job.id + "-", dir=staging) as temporary:
            root = Path(temporary)
            inputs, output = root / "input", root / "output"
            inputs.mkdir()
            output.mkdir()
            (inputs / "script.py").write_text(document["source"], encoding="utf-8")
            (inputs / "request.json").write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            shutil.copyfile(ROOT / "backend/yaha/blender/script_runner.py", inputs / "runner.py")
            if source:
                (inputs / "source.json").write_bytes(source)
            command = [shutil.which("bwrap"), "--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL", "--clearenv"]
            for name in ("/usr", "/bin", "/lib", "/lib64"):
                if Path(name).exists():
                    command += ["--ro-bind", name, name]
            command += ["--dir", "/etc"]
            for name in ("/etc/ld.so.cache", "/etc/fonts", "/etc/localtime"):
                if Path(name).exists():
                    command += ["--ro-bind", name, name]
            executable = Path(config["executable"]).resolve()
            if not executable.is_relative_to("/usr") and not executable.is_relative_to("/bin"):
                command += ["--dir", "/opt", "--dir", "/opt/blender", "--ro-bind", str(executable), "/opt/blender/blender"]
                for name in (config["allowed_version"], "lib", "textures", "usd"):
                    resource = executable.parent / name
                    if resource.is_dir():
                        command += ["--ro-bind", str(resource), "/opt/blender/" + name]
                binary = "/opt/blender/blender"
            else:
                binary = str(executable)
            command += ["--proc", "/proc", "--dev", "/dev", "--size", "268435456", "--tmpfs", "/tmp",
                        "--dir", "/home", "--size", "16777216", "--tmpfs", "/home/script",
                        "--ro-bind", str(inputs), "/input", "--bind", str(output), "/output", "--chdir", "/output",
                        "--remount-ro", "/",
                        "--setenv", "HOME", "/home/script", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "LANG", "C.UTF-8",
                        "--setenv", "OMP_NUM_THREADS", "2", "--", binary, "--background", "--factory-startup", "--disable-autoexec",
                        "--offline-mode", "--threads", "2", "--python-exit-code", "20", "--python", "/input/runner.py"]
            command = [shutil.which("prlimit"), "--as=8589934592", "--cpu=180", "--fsize=41943040", "--nofile=256", "--core=0", "--", *command]
            deadline = time.monotonic() + min(config["timeout_seconds"], 180)
            job.progress(5, "在独立空间运行 Blender 脚本")
            with (root / "execution.log").open("wb") as log:
                process = subprocess.Popen(command, cwd=root, env={"PATH": "/usr/bin:/bin"}, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    while process.poll() is None:
                        job.check()
                        if time.monotonic() >= deadline:
                            raise DomainError("脚本运行超时，原版本保留。", "SCRIPT_TIMEOUT")
                        check_output_budget(output, config["max_output_mb"] * 1024 * 1024)
                        time.sleep(0.1)
                finally:
                    if process.poll() is None:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                    process.wait(timeout=10)
                    diagnostic = (root / "execution.log").read_bytes()[-12000:].decode("utf-8", errors="replace")
                    job.record(script_diagnostics={"exit_code": process.returncode, "log": diagnostic})
            if process.returncode:
                detail = diagnostic[-2500:]
                raise DomainError("脚本运行失败，请查看运行日志与 script.py 行号。\n" + detail, "SCRIPT_EXECUTION")
            check_output_budget(output, config["max_output_mb"] * 1024 * 1024)
            path = output / "candidate.json"
            # 输出由不受信任代码写入；禁止链接、越界和超大文件。
            if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= config["max_output_mb"] * 1024 * 1024:
                raise DomainError("脚本未返回有效候选模型，或文件超过预算。", "SCRIPT_OUTPUT")
            try:
                data = json.loads(path.read_bytes())
                vertices, faces = data["vertices"], data["faces"]
                if not isinstance(vertices, list) or not isinstance(faces, list) or not 3 <= len(vertices) <= 600_000 or not 1 <= len(faces) <= config["max_faces"]:
                    raise ValueError()
                if any(not isinstance(point, list) or len(point) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 1_000_000 for v in point) for point in vertices):
                    raise ValueError()
                if any(not isinstance(face, list) or len(face) != 3 or any(type(v) is not int or not 0 <= v < len(vertices) for v in face) for face in faces):
                    raise ValueError()
            except (ValueError, KeyError, TypeError, OverflowError, RecursionError):
                raise DomainError("脚本输出的几何坐标、面索引或网格预算无效。", "SCRIPT_OUTPUT") from None
            return json.dumps({"vertices": vertices, "faces": faces}, allow_nan=False).encode()
