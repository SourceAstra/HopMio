#!/usr/bin/env python3
"""安装经官方 SHA-256 校验的独立 Blender，不修改系统 Python。"""

import hashlib
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

VERSION = "4.5.14"
BASE = "https://download.blender.org/release/Blender4.5/"
ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    if platform.machine().lower() not in ("x86_64", "amd64"):
        raise RuntimeError("此安装入口支持 Linux／Windows x64，请手动配置其他架构的 Blender。")
    windows = sys.platform == "win32"
    if not windows and sys.platform != "linux":
        raise RuntimeError("此安装入口仅支持 Linux／Windows。")
    archive = f"blender-{VERSION}-{'windows-x64.zip' if windows else 'linux-x64.tar.xz'}"
    parent = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "yaha-craft/blender"
    target = parent / VERSION
    executable = target / ("blender.exe" if windows else "blender")
    if executable.is_file():
        subprocess.run([str(executable), "--version"], check=True)
        print("已安装：", executable)
        return
    cache = (ROOT if (ROOT / "scripts/install-blender.py").is_file() else parent) / ".artifacts/downloads"
    cache.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(BASE + f"blender-{VERSION}.sha256", headers={"User-Agent": "YaHa-Craft"})
    with urllib.request.urlopen(request, timeout=60) as response:
        checksums = response.read().decode()
    expected = next(line.split()[0] for line in checksums.splitlines() if line.split()[-1].lstrip("*./") == archive)
    file = cache / archive
    if not file.is_file() or digest(file) != expected:
        print("下载 Blender：", archive, flush=True)
        partial = file.with_suffix(file.suffix + ".partial")
        request = urllib.request.Request(BASE + archive, headers={"User-Agent": "YaHa-Craft"})
        if not partial.is_file() or digest(partial) != expected:
            with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
                shutil.copyfileobj(response, output)
        if digest(partial) != expected:
            raise RuntimeError("安装包校验失败，未安装。请重新运行安装入口。")
        partial.replace(file)
    staging = parent / (VERSION + ".installing")
    if staging.is_dir():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    if windows:
        with zipfile.ZipFile(file) as package:
            if any(Path(name).is_absolute() or ".." in Path(name).parts for name in package.namelist()):
                raise RuntimeError("安装包路径无效。")
            package.extractall(staging)
    else:
        with tarfile.open(file) as package:
            package.extractall(staging, filter="data")
    unpacked = staging / archive.removesuffix(".tar.xz").removesuffix(".zip")
    subprocess.run([str(unpacked / executable.name), "--version"], check=True)
    unpacked.replace(target)
    staging.rmdir()
    print("已安装：", executable)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Blender 安装失败：", error, file=sys.stderr)
        sys.exit(1)
