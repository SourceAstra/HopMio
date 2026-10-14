#!/usr/bin/env bash
# ==============================================================================
# YaHa Craft (呀哈造物) - Linux 三维建模与逆向重建工具环境安装脚本
# ==============================================================================
set -Eeuo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$ROOT_DIR"

usage() {
    cat <<'EOF'
用法：./setup.sh [--all | --blender | --reconstruction | --slicer | --deps]

选项：
  --all             完整安装所有三维工具与 Python 依赖（默认）
  --deps            仅安装 Python 后端依赖包 (backend/requirements-lock.txt)
  --blender         安装 Blender 4.5.14 LTS 官方运行时
  --reconstruction  安装三维表面重建工具 (OpenMVS 与 pycolmap)
  --slicer          安装 Bambu Studio CLI 切片工具
  -h, --help        显示本帮助信息

示例：
  ./setup.sh               # 一键安装完整三维建模、重建与切片工具链
  ./setup.sh --blender     # 仅安装或更新 Blender 运行时
EOF
}

TARGET="all"
case "${1:-}" in
    ''|--all) TARGET="all" ;;
    --deps) TARGET="deps" ;;
    --blender) TARGET="blender" ;;
    --reconstruction) TARGET="reconstruction" ;;
    --slicer) TARGET="slicer" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知选项: $1" >&2; usage >&2; exit 2 ;;
esac

PYTHON_BIN="${YAHA_PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
    if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
        PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
    elif command -v python3.12 >/dev/null 2>&1; then
        PYTHON_BIN="python3.12"
    elif command -v python3 >/dev/null 2>&1; then
        PYTHON_BIN="python3"
    else
        echo "错误: 未找到可用的 Python 环境，请先配置 .venv 或安装 python3。" >&2
        exit 1
    fi
fi

install_deps() {
    echo "==> 安装后端 Python 依赖库..."
    "$PYTHON_BIN" -m pip install --only-binary=:all: -r "$ROOT_DIR/backend/requirements-lock.txt"
}

install_blender() {
    echo "==> 安装 Blender 4.5 LTS 官方运行时..."
    "$PYTHON_BIN" "$ROOT_DIR/scripts/install-blender.py"
}

install_reconstruction() {
    echo "==> 安装三维表面重建工具 (OpenMVS & pycolmap)..."
    "$PYTHON_BIN" -m pip install --only-binary=:all: 'pycolmap==4.2.1' || true
    "$PYTHON_BIN" "$ROOT_DIR/scripts/install-reconstruction.py"
}

install_slicer() {
    echo "==> 安装 Bambu Studio 切片工具..."
    "$PYTHON_BIN" "$ROOT_DIR/scripts/install-slicer.py"
}

case "$TARGET" in
    all)
        install_deps
        install_blender
        install_reconstruction
        install_slicer
        echo "==> 全部三维建模与逆向工具安装完成！启动服务后生效。"
        ;;
    deps)
        install_deps
        ;;
    blender)
        install_blender
        ;;
    reconstruction)
        install_reconstruction
        ;;
    slicer)
        install_slicer
        ;;
esac
