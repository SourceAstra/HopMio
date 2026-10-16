#!/usr/bin/env python3
"""安装官方 Bambu Studio，使用 A1 mini 官方参数执行本地切片。"""

import json
import platform
import subprocess
import sys
import tempfile
import hashlib
from pathlib import Path
from runtime_install import USER_ROOT, download, extract_zip

VERSION = "02.08.02.61"
BASE = "https://github.com/bambulab/BambuStudio/releases/download/v" + VERSION + "/"
PACKAGES = {
    "linux": ("BambuStudio_ubuntu24.04-v02.08.02.61-20260820225108.AppImage", "d501b103fac5424513ec0e8d6bc145fb30719de2c7d94d7320d723740c81a7fd"),
    "win32": ("Bambu_Studio_win-v02.08.02.61-20260820225108.zip", "3faaa194a90a2e7defa39a6a63f5a654b8cdb762c6a98556cf771fba582229f5"),
}
UBUNTU22 = ("BambuStudio_ubuntu22.04-v02.08.02.61-20260820225108.AppImage", "69426a59682574591590f51c913d3889baa19252d1c8e9fcae2497eb0ed6bf92")


def extract_appimage(file, root):
    file.chmod(file.stat().st_mode | 0o111)
    with (root / "extract.log").open("wb") as log:
        subprocess.run([str(file), "--appimage-extract"], cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=180)
    return root / "squashfs-root/AppRun"


def extract_windows(file, root):
    extract_zip(file, root)
    paths = list(root.rglob("bambu-studio.exe"))
    if len(paths) != 1:
        raise RuntimeError("Bambu Studio ZIP 缺少唯一程序。")
    return paths[0]


EXTRACTORS = {"linux": extract_appimage, "win32": extract_windows}


def check_cli(executable):
    # 隔离本次帮助检查的回执；Windows GUI 程序可能不向重定向管道输出帮助。
    with tempfile.TemporaryDirectory(prefix="bambu-help-") as directory:
        result = subprocess.run(
            [str(executable), "--help"], cwd=directory, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        output = result.stdout + result.stderr
        help_available = "--slice" in output and "--load-settings" in output
        receipt_valid = False
        receipt = Path(directory) / "result.json"
        if sys.platform == "win32" and receipt.is_file():
            try:
                value = json.loads(receipt.read_text(encoding="utf-8"))
                receipt_valid = (isinstance(value, dict) and value.get("return_code") == 0
                                 and value.get("error_string") == "Success."
                                 and {"prepare_time", "export_time", "plate_index"} <= value.keys())
            except (OSError, ValueError):
                pass
        if result.returncode != 0 or not (help_available or receipt_valid):
            raise RuntimeError(f"Bambu Studio 切片入口检查失败（退出码 {result.returncode}）：" + (output[-800:] or "没有帮助输出或有效 CLI 回执"))


def prepare_cli_models(root, profiles):
    directory = profiles / "BBL/machine_full"
    directory.mkdir(exist_ok=True)
    records = {}
    for source in (profiles / "BBL/machine").glob("*.json"):
        data = source.read_bytes()
        if json.loads(data).get("type") == "machine_model":
            destination = directory / source.name
            if destination.is_file() and destination.read_bytes() != data:
                raise RuntimeError("CLI 机型描述与官方源文件不一致：" + source.name)
            destination.write_bytes(data)
            records[str(destination.relative_to(root))] = hashlib.sha256(data).hexdigest()
    return records


def main():
    if sys.platform not in PACKAGES or platform.machine().lower() not in ("amd64", "x86_64"):
        raise RuntimeError("自动安装支持 Windows/Linux x64。")
    parent = USER_ROOT / "slicing"
    target = parent / VERSION
    if (target / "installation.json").is_file():
        file = target / "installation.json"
        metadata = json.loads(file.read_text())
        check_cli(target / metadata["executable"])
        metadata["cli_models"] = prepare_cli_models(target, target / metadata["profiles"])
        temporary = file.with_suffix(".new")
        temporary.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        temporary.replace(file)
        print("已安装 Bambu Studio：", target)
        return
    name, expected = PACKAGES[sys.platform]
    if sys.platform == "linux" and tuple(map(int, platform.libc_ver()[1].split(".")[:2])) < (2, 39):
        name, expected = UBUNTU22
    file = download(BASE + name, expected, name)
    parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="install-", dir=parent) as temporary:
        staging = Path(temporary)
        executable = EXTRACTORS[sys.platform](file, staging)
        profiles = list(staging.rglob("BBL.json"))
        if len(profiles) != 1:
            raise RuntimeError("Bambu Studio 缺少唯一官方打印参数库。")
        check_cli(executable)
        metadata = {"version": VERSION, "url": BASE + name, "sha256": expected, "executable": str(executable.relative_to(staging)), "profiles": str(profiles[0].parent.relative_to(staging))}
        metadata["cli_models"] = prepare_cli_models(staging, profiles[0].parent)
        (staging / "installation.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        if target.exists():
            raise RuntimeError("发现未完成安装目录，请保留并在 config/slicing.yaml 指定有效程序。")
        staging.replace(target)
    print("已安装 Bambu Studio：", target)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("切片运行时安装失败：", error, file=sys.stderr)
        sys.exit(1)
