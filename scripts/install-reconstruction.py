#!/usr/bin/env python3
"""安装官方 CPU 重建运行时；Linux/Windows 共用清单，失败保留原安装。"""

import json
import platform
import subprocess
import sys
import tempfile
from pathlib import Path
from runtime_install import USER_ROOT, download, extract_zip

VERSION = "2.4.0"
PACKAGES = {
    "linux": ("OpenMVS_Ubuntu_x64.zip", "7104ae1ddd6ca38fbca9e0e4a70b20af59e21e0b497eb7181c864fbf38ca8d00"),
    "win32": ("OpenMVS_Windows_x64.zip", "0c31660c15c9ebc4c106873cf67564d9570d404aef7a6403451da1b6178b2167"),
}
TOOLS = ("InterfaceCOLMAP", "DensifyPointCloud", "ReconstructMesh", "RefineMesh", "TextureMesh")


def executable(root, name):
    matches = list(root.rglob(name + (".exe" if sys.platform == "win32" else "")))
    if len(matches) != 1:
        raise RuntimeError("安装包缺少唯一工具：" + name)
    return matches[0]


def check(root):
    tools = {}
    for name in TOOLS:
        file = executable(root, name)
        if sys.platform != "win32":
            file.chmod(file.stat().st_mode | 0o111)
        with tempfile.TemporaryDirectory(prefix="openmvs-help-") as directory:
            result = subprocess.run([str(file), "--help"], cwd=directory, capture_output=True, text=True, timeout=15)
        output = result.stdout + result.stderr
        if "OpenMVS" not in output or "options" not in output.lower():
            raise RuntimeError(name + " 无法启动：" + output[-500:])
        tools[name] = str(file.relative_to(root))
    return tools


def main():
    if sys.platform not in PACKAGES or platform.machine().lower() not in ("amd64", "x86_64"):
        raise RuntimeError("自动安装支持 Windows/Linux x64；其他平台请配置 config/reconstruction.yaml。")
    name, expected = PACKAGES[sys.platform]
    parent = USER_ROOT / "reconstruction"
    target = parent / VERSION
    if (target / "installation.json").is_file():
        check(target)
        print("已安装 OpenMVS：", target)
        return
    url = "https://github.com/cdcseacave/openMVS/releases/download/v" + VERSION + "/" + name
    archive = download(url, expected, name)
    parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="install-", dir=parent) as directory:
        staging = Path(directory)
        extract_zip(archive, staging, 1024 * 1024 * 1024)
        tools = check(staging)
        (staging / "installation.json").write_text(json.dumps({"version": VERSION, "url": url, "sha256": expected, "tools": tools}, indent=2), encoding="utf-8")
        if target.exists():
            raise RuntimeError("发现未完成的安装目录，请保留目录并改用配置指定有效工具。")
        staging.replace(target)
    print("已安装 OpenMVS：", target)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("表面重建工具安装失败：", error, file=sys.stderr)
        sys.exit(1)
