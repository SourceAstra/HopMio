"""项目本地后台进程入口：PID 身份校验、日志与进程树清理，不注册系统服务。"""

import argparse
import fcntl
import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


def process(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": pid, "ppid": int(fields[1]), "started": fields[19], "state": fields[0]}
    except (OSError, ValueError, IndexError):
        return None


def alive(identity):
    current = process(identity["pid"])
    return bool(current and current["started"] == identity["started"] and current["state"] != "Z")


def running(state):
    if not state.is_file():
        return None
    identity = json.loads(state.read_text())
    return identity if alive(identity) else None


def family(identity):
    tree = {identity["pid"]: identity}
    processes = [item for path in Path("/proc").iterdir() if path.name.isdigit() and (item := process(int(path.name)))]
    while True:
        children = [item for item in processes if item["ppid"] in tree and item["pid"] not in tree]
        if not children:
            break
        tree.update((item["pid"], item) for item in children)
    return tree


def graceful_kill(tree):
    for item in reversed(list(tree.values())):
        if alive(item):
            try:
                os.kill(item["pid"], signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 15
    while any(alive(item) for item in tree.values()) and time.monotonic() < deadline:
        time.sleep(0.1)
    for item in reversed(list(tree.values())):
        if alive(item):
            try:
                os.kill(item["pid"], signal.SIGKILL)
            except ProcessLookupError:
                pass


def stop(state):
    root = running(state)
    if root:
        graceful_kill(family(root))
    state.unlink(missing_ok=True)
    print("本项目后台进程已停止。")


def listening(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            return True
    except OSError:
        return False


def port_owners(port):
    """返回正在监听该端口的进程 PID 列表（经 /proc 匹配 socket inode）。"""
    owners = []
    try:
        rows = [line.split() for line in Path("/proc/net/tcp").read_text().splitlines()[1:]]
        inodes = {int(row[9]) for row in rows if len(row) > 9 and row[3] == "0A" and int(row[1].split(":")[1], 16) == port}
    except (OSError, ValueError, IndexError):
        return owners
    for path in Path("/proc").iterdir():
        if not path.name.isdigit():
            continue
        try:
            sockets = {item.readlink().as_posix() for item in (path / "fd").iterdir()}
        except OSError:
            continue
        if any(f"socket:[{inode}]" in item for inode in inodes for item in sockets):
            owners.append(int(path.name))
    return owners


def cmdline(pid):
    try:
        return Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "replace").strip()
    except OSError:
        return ""


def take_over(port, command):
    """强制接管端口：只终止属于本项目的进程；无关程序仍拒绝处理。"""
    root = str(Path(command[0]).resolve().parent.parent)
    for pid in port_owners(port):
        text = cmdline(pid)
        executable = Path(text.split()[0]).name if text.split() else ""
        if text and root not in text and executable not in ("yaha", "hopmio"):
            print(f"端口 {port} 被无关程序占用：PID {pid}（{text}），请手动处理。")
            return False
    for pid in port_owners(port):
        identity = process(pid)
        text = cmdline(pid)
        if identity and alive(identity):
            print(f"强制接管端口 {port}：停止 PID {pid}（{text[:100]}）。")
            graceful_kill(family(identity))
    deadline = time.monotonic() + 10
    while port_owners(port) and time.monotonic() < deadline:
        time.sleep(0.1)
    if port_owners(port):
        print(f"端口 {port} 仍被占用，接管失败。")
        return False
    return True


def ready(pid, port):
    if pid not in port_owners(port):
        return False
    try:
        request = urllib.request.Request(f"http://127.0.0.1:{port}/api/rpc", data=b'{"method":"settings.get","params":{}}', headers={"Content-Type": "application/json"})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=2) as response:
            answer = json.load(response)
        return isinstance(answer.get("result"), dict) and not answer.get("error")
    except (OSError, ValueError, urllib.error.URLError):
        return False


def start(state, port, command, force=False):
    current = running(state)
    if current:
        print(f"已在后台运行，PID={current['pid']}。")
        return
    if listening(port):
        if not force:
            raise RuntimeError(f"端口 {port} 已被其他进程占用；加 --force 强制接管，或先释放端口。")
        if not take_over(port, command):
            raise RuntimeError(f"端口 {port} 接管失败，请手动处理占用进程。")
    log = state.with_name("yaha.log")
    with log.open("ab") as stream:
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=lambda: signal.signal(signal.SIGHUP, signal.SIG_IGN))
    try:
        identity = process(child.pid)
        if not identity:
            raise RuntimeError(f"后台进程启动失败，请查看 {log}。")
        temporary = state.with_suffix(".new")
        temporary.write_text(json.dumps(identity | {"schema_version": "yaha.local-service/v1", "port": port, "log": str(log)}))
        temporary.replace(state)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError(f"后台进程已退出，请查看 {log}。")
            if ready(child.pid, port):
                print(f"后台启动完成，PID={child.pid}，地址：http://127.0.0.1:{port}")
                print(f"实时日志：tail -f {log}")
                print("停止：./deploy.sh --stop")
                return
            time.sleep(0.2)
        raise RuntimeError(f"启动超时，请查看 {log}。")
    except BaseException:
        if state.is_file():
            stop(state)
        elif child.poll() is None:
            child.kill()
        state.with_suffix(".new").unlink(missing_ok=True)
        child.wait(timeout=5)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("action", choices=("start", "stop", "status"))
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("端口须在 1–65535 之间")
    args.state.parent.mkdir(parents=True, exist_ok=True)
    with args.state.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.action == "stop":
            stop(args.state)
        elif args.action == "status":
            current = running(args.state)
            print(f"运行中：PID={current['pid']}，端口={current['port']}，日志={current['log']}" if current else "未运行。")
        else:
            command = args.command[1:] if args.command[:1] == ["--"] else args.command
            if not command:
                parser.error("启动缺少宿主命令")
            start(args.state, args.port, command, force=args.force)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        raise SystemExit(str(error))
