"""通过 Windows 系统启动已安装的 Bambu Studio，仅打开界面或受控模型文件。"""
import os
import shutil
import subprocess
import sys
from pathlib import Path
import yaml
from ..contracts import DomainError
from ..modeling.runtime import ROOT


def find_studio():
    config = ROOT / "config/slicing.yaml"
    try:
        configured = (yaml.safe_load(config.read_text(encoding="utf-8")) or {}).get("bambu_path", "auto")
    except (OSError, ValueError, yaml.YAMLError):
        raise DomainError("切片配置无法读取，请检查 config/slicing.yaml。", "STUDIO_CONFIG") from None
    if configured != "auto":
        candidates = [Path(str(configured)).expanduser()]
    else:
        local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
        candidates = [
            local / "yaha-craft/slicing/02.08.02.61/bambu-studio.exe",
            Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Bambu Studio/bambu-studio.exe",
            Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Bambu Studio/bambu-studio.exe",
            local / "Programs/Bambu Studio/bambu-studio.exe",
        ]
        found = shutil.which("bambu-studio.exe")
        if found:
            candidates.append(Path(found))
    for candidate in candidates:
        path = candidate.resolve()
        if path.name.lower() == "bambu-studio.exe" and path.is_file():
            return path
    raise DomainError("未找到 Bambu Studio。请运行“安装建模工具.cmd”，或在 config/slicing.yaml 的 bambu_path 指定程序路径。", "STUDIO_UNAVAILABLE")


def open_studio(assets, asset_id=None):
    if sys.platform != "win32":
        raise DomainError("直接拉起 Bambu Studio 目前支持 Windows 本机服务；可先下载模型后手动打开。", "STUDIO_PLATFORM")
    model = assets.path(asset_id).resolve() if asset_id else None
    if model and model.suffix.lower() not in (".3mf", ".stl"):
        raise DomainError("只能交给 Bambu Studio 打开 STL 或 3MF 模型。", "STUDIO_FORMAT")
    executable = find_studio()
    try:
        # 使用 Windows 应用启动接口；不执行浏览器传入的路径、命令或打印参数。
        os.startfile(str(executable), "open", subprocess.list2cmdline([str(model)]) if model else "", str(executable.parent), 1)
    except OSError:
        raise DomainError("Bambu Studio 启动失败，请检查安装目录或重新安装建模工具。", "STUDIO_LAUNCH") from None
    return {"handed_off": True, "with_model": model is not None}
