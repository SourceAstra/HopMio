"""解析本项目 Blender 配置，兼容独立安装和显式路径。"""

import os
import shutil
import subprocess
import sys
from pathlib import Path
import yaml
from ..contracts import DomainError

def get_root():
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "config").is_dir():
            return parent
    return p.parents[2]

ROOT = get_root()


def photo_review_policy():
    try:
        data = yaml.safe_load((ROOT / "config/modeling.yaml").read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError()
        config = {"max_revisions": 2, "timeout_seconds": 1200, "min_mean_iou": 0.65, "min_view_iou": 0.5, "min_observed_ratio": 0.75} | data.get("photo_review", {})
        if type(config["max_revisions"]) is not int or not 0 <= config["max_revisions"] <= 3 or not 60 <= config["timeout_seconds"] <= 1800 or not 0.5 <= config["min_view_iou"] <= config["min_mean_iou"] <= 0.95 or not 0.5 <= config["min_observed_ratio"] <= 1:
            raise ValueError()
        return config
    except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError):
        raise DomainError("照片审阅预算或门槛配置无效。", "PHOTO_REVIEW_CONFIG") from None


def runtime():
    try:
        config = yaml.safe_load((ROOT / "config/modeling.yaml").read_text(encoding="utf-8"))
        if config["schema_version"] != "yaha.modeling-runtime/v1":
            raise ValueError()
        if not 10 <= config["timeout_seconds"] <= 600 or not 1000 <= config["max_faces"] <= 200000 or not 1 <= config["max_output_mb"] <= 40:
            raise ValueError()
        executable = os.environ.get("YAHA_BLENDER", config["blender_path"])
        if executable == "auto":
            parent = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share"))
            local = parent / "yaha-craft/blender/4.5.14" / ("blender.exe" if sys.platform == "win32" else "blender")
            executable = str(local) if local.is_file() else shutil.which("blender")
        if not executable:
            raise ValueError()
        path = Path(executable).expanduser().resolve()
        if not path.is_file():
            raise ValueError()
        return config | {"executable": str(path)}
    except Exception:
        raise DomainError("未找到 Blender，请运行 scripts/install-blender.py 或配置 YAHA_BLENDER。", "BLENDER_CONFIG") from None


def availability():
    try:
        config = runtime()
        output = subprocess.run([config["executable"], "--version"], capture_output=True, text=True, timeout=10, check=True).stdout.splitlines()[0]
        if not output.startswith("Blender " + config["allowed_version"] + "."):
            raise DomainError("Blender 版本不在已配置的兼容范围内。", "BLENDER_VERSION")
        return {"available": True, "version": output, "message": "本地 Blender 建模已配置"}
    except DomainError as error:
        return {"available": False, "message": str(error)}
    except (OSError, subprocess.SubprocessError, IndexError):
        return {"available": False, "message": "Blender 无法启动，请检查安装和系统依赖。"}
