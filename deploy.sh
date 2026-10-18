#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ACTION="build-start"

usage() {
    cat <<'EOF'
用法：./deploy.sh [--start | --build | --no-start | --stop | --status | --restart | --foreground] [--no-force]
默认编译 Go 宿主与前端，然后后台启动：http://127.0.0.1:5173
默认强制部署：端口被本项目相关进程（含其他守护者拉起的实例）占用时自动接管。
--start       使用已有程序后台启动，不编译
--build       同默认：编译后后台启动
--no-start    仅编译，不启动
--stop        停止本项目后台进程及其引擎子进程
--status      查看本项目后台进程状态
--restart     使用已有程序重启后台进程
--foreground  使用已有程序前台启动，Ctrl+C 停止
--no-force    端口被占用时报错退出，不自动终止占用进程
不安装系统服务，不设置自动启动；强制接管只终止属于本项目的进程，无关程序仍会拒绝处理。
可选环境变量：YAHA_PORT、YAHA_DATA_DIR、YAHA_WEB_DIR、YAHA_PYTHON
EOF
}

FORCE=1
while [[ $# -gt 0 ]]; do
    case "$1" in
        --start) ACTION="start" ;;
        --build) ;;
        --no-start) ACTION="build" ;;
        --stop) ACTION="stop" ;;
        --status) ACTION="status" ;;
        --restart) ACTION="restart" ;;
        --foreground) ACTION="foreground" ;;
        --no-force) FORCE=0 ;;
        -h|--help) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
    shift
done
[[ "$(uname -s)" == Linux ]] || { echo "此入口仅支持 Linux。" >&2; exit 1; }
cd -- "$ROOT_DIR"

PORT="${YAHA_PORT:-${HOPMIO_PORT:-5173}}"
DATA_DIR="${YAHA_DATA_DIR:-${HOPMIO_DATA_DIR:-$ROOT_DIR/.state}}"
[[ "$DATA_DIR" == /* ]] || DATA_DIR="$ROOT_DIR/$DATA_DIR"

if [[ -z "${YAHA_PYTHON:-}" && -x "$ROOT_DIR/.venv/bin/python" ]]; then
    export YAHA_PYTHON="$ROOT_DIR/.venv/bin/python"
fi
export PYTHONPATH="$ROOT_DIR/backend${PYTHONPATH:+:$PYTHONPATH}"
export YAHA_DATA_DIR="$DATA_DIR"
export YAHA_MODEL_CONFIG="${YAHA_MODEL_CONFIG:-$ROOT_DIR/config/models.yaml}"

CONTROL_PYTHON="${YAHA_PYTHON:-python3}"
STATE_FILE="$ROOT_DIR/.artifacts/linux/service.json"
if [[ "$ACTION" != foreground ]]; then
    mkdir -p -- "$ROOT_DIR/.artifacts/linux"
    exec 9>"$ROOT_DIR/.artifacts/linux/deploy.lock"
    flock 9
fi
control() {
    "$CONTROL_PYTHON" "$ROOT_DIR/scripts/local_service.py" --state "$STATE_FILE" --port "$PORT" "$@"
}
case "$ACTION" in
    stop|status) control "$ACTION"; exit 0 ;;
esac

if [[ "$ACTION" == build || "$ACTION" == build-start ]]; then
    command -v go >/dev/null || { echo "构建需要 Go 1.22+。" >&2; exit 1; }
    command -v pnpm >/dev/null || { echo "构建前端需要 pnpm，请先安装项目依赖。" >&2; exit 1; }
    mkdir -p -- "$ROOT_DIR/.artifacts/linux" "$ROOT_DIR/bin"
    echo "正在构建前端到 .artifacts/web ..."
    pnpm exec tsc --noEmit
    pnpm exec vite build --outDir .artifacts/linux/web-next
    echo "正在构建 Go 宿主 ..."
    GOCACHE="$ROOT_DIR/.artifacts/go-cache" go build -o "$ROOT_DIR/.artifacts/linux/yaha" ./cmd/server
    control stop
    install -m 0755 -- "$ROOT_DIR/.artifacts/linux/yaha" "$ROOT_DIR/bin/yaha"
    "$CONTROL_PYTHON" - "$ROOT_DIR" <<'PUBLISH'
import shutil, sys
from pathlib import Path
root = Path(sys.argv[1])
web, previous = root / '.artifacts/web', root / '.artifacts/linux/web-previous'
if previous.exists():
    shutil.rmtree(previous)
if web.exists():
    web.rename(previous)
try:
    (root / '.artifacts/linux/web-next').rename(web)
except BaseException:
    if previous.exists():
        previous.rename(web)
    raise
PUBLISH
    if [[ "$ACTION" == build ]]; then
        echo "构建完成；执行 ./deploy.sh --start 后台启动。"
        exit 0
    fi
fi

WEB_DIR="${YAHA_WEB_DIR:-}"
if [[ -z "$WEB_DIR" ]]; then
    WEB_DIR="$ROOT_DIR/.artifacts/web"
    # 仅兼容读取已有旧产物；新的构建统一写入 .artifacts/web。
    [[ -f "$WEB_DIR/index.html" ]] || WEB_DIR="$ROOT_DIR/dist"
fi
[[ "$WEB_DIR" == /* ]] || WEB_DIR="$ROOT_DIR/$WEB_DIR"
[[ -f "$WEB_DIR/index.html" ]] || {
    echo "未找到前端资源；先执行 ./deploy.sh --no-start，或设置 YAHA_WEB_DIR。" >&2
    exit 1
}

BINARY="$ROOT_DIR/bin/yaha"
[[ -x "$BINARY" ]] || BINARY="$ROOT_DIR/bin/hopmio"
[[ -x "$BINARY" ]] || {
    echo "未找到宿主程序；先执行 ./deploy.sh --no-start。" >&2
    exit 1
}

if [[ "$ACTION" == foreground ]]; then
    echo "呀哈造物 · 前台启动，Ctrl+C 停止。"
    exec "$BINARY" -port "$PORT" -data "$DATA_DIR" -web "$WEB_DIR"
fi
[[ "$ACTION" != restart ]] || control stop
FORCE_FLAG=""
if [[ "$FORCE" == 1 ]]; then FORCE_FLAG="--force"; fi
control $FORCE_FLAG start -- "$BINARY" -port "$PORT" -data "$DATA_DIR" -web "$WEB_DIR"
