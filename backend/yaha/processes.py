"""外部工具统一取消、超时、日志边界；不通过 shell 执行。"""

import json
import os
import signal
import subprocess
import time


def run(command, directory, stage, deadline, job):
    log = directory / (stage + ".log")
    environment = {key: value for key, value in os.environ.items() if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "LANG", "LC_ALL", "LD_LIBRARY_PATH"}}
    environment.update(QT_QPA_PLATFORM="offscreen", OMP_NUM_THREADS="8")
    for key in ("DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR"):
        if key in os.environ:
            environment[key] = os.environ[key]
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    with log.open("wb") as stream:
        process = subprocess.Popen(command, cwd=directory, env=environment, stdout=stream, stderr=subprocess.STDOUT, **group)
        last = None
        try:
            while process.poll() is None:
                job.check()
                if time.monotonic() > deadline:
                    raise TimeoutError(stage + " 超过配置的时间预算，上一版本已保留。")
                progress = directory / "progress.json"
                if progress.is_file():
                    state = json.loads(progress.read_text(encoding="utf-8"))
                    if state != last:
                        job.progress(state["percent"], state["stage"])
                        last = state
                time.sleep(0.15)
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
            with log.open("rb") as source:
                source.seek(max(0, log.stat().st_size - 4096))
                tail = source.read().decode("utf-8", errors="replace")
            field = "slicing_diagnostics" if stage == "BambuStudio" else "reconstruction_diagnostics"
            job.record(**{field: {"stage": stage, "exit_code": process.returncode, "log": tail}})
            job.tool_record(stage, exit_code=process.returncode, log=tail)
        if process.returncode:
            error = directory / "error.json"
            message = json.loads(error.read_text())["message"] if error.is_file() else stage + " 未完成，请查看任务诊断。"
            raise RuntimeError(message)
