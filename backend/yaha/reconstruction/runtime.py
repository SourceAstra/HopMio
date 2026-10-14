import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path
import yaml
from ..contracts import DomainError
from ..modeling.runtime import ROOT

TOOLS = ("InterfaceCOLMAP", "DensifyPointCloud", "ReconstructMesh", "RefineMesh", "TextureMesh")


def configuration():
    try:
        config = yaml.safe_load((ROOT / "config/reconstruction.yaml").read_text(encoding="utf-8"))
        config.setdefault("min_registered_views", 3)
        config.setdefault("registration_policy", "strict" if config.get("schema_version") == "yaha.reconstruction/v1" else "progressive")
        for name in ("estimate_affine_shape", "domain_size_pooling", "guided_matching"):
            if not isinstance(config.setdefault(name, True), bool):
                raise ValueError()
        if config["schema_version"] not in ("yaha.reconstruction/v1", "yaha.reconstruction/v2") or config["registration_policy"] not in ("strict", "progressive") or not 512 <= config["photo_texture_size"] <= 2048 or not 0.8 <= config["min_textured_surface_ratio"] <= 1:
            raise ValueError()
        ranges = {"min_photos": (3, 96), "max_photos": (3, 96), "max_input_mb": (1, 256), "max_image_size": (800, 4096), "threads": (1, 32), "timeout_seconds": (60, 14400), "min_sparse_points": (50, 10000), "min_blur_score": (0, 1000), "min_features": (0, 10000), "depth_resolution_level": (0, 3), "max_texture_size": (512, 4096), "voxel_mm": (0.08, 2), "min_registered_ratio": (0.5, 1)}
        if any(not low <= config[name] <= high for name, (low, high) in ranges.items()) or not 3 <= config["min_registered_views"] <= config["min_photos"] or not 0 <= config["max_removed_volume_ratio"] <= 0.05 or not 0.1 <= config["max_reprojection_error_px"] <= 10 or config["min_photos"] > config["max_photos"] or config["camera_model"] not in ("SIMPLE_RADIAL", "PINHOLE", "SIMPLE_PINHOLE", "OPENCV"):
            raise ValueError()
        return config
    except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError):
        raise DomainError("config/reconstruction.yaml 配置无效。", "RECONSTRUCTION_CONFIG") from None


def tool_paths(config):
    root = os.environ.get("YAHA_OPENMVS", config["openmvs_path"])
    if root == "auto":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "yaha-craft/reconstruction/2.4.0"
    root = Path(root).expanduser().resolve()
    installation = root / "installation.json"
    metadata = json.loads(installation.read_text()) if installation.is_file() else {}
    result = {}
    for name in TOOLS:
        relative = metadata.get("tools", {}).get(name)
        path = root / relative if relative else root / (name + (".exe" if sys.platform == "win32" else ""))
        if not path.is_file():
            found = shutil.which(name)
            if not found:
                raise DomainError("未找到 " + name + "，请运行安装表面重建入口。", "RECONSTRUCTION_UNAVAILABLE")
            path = Path(found)
        if relative and not path.resolve().is_relative_to(root):
            raise DomainError("重建安装清单路径无效。", "RECONSTRUCTION_CONFIG")
        result[name] = str(path.resolve())
    return result


def availability():
    try:
        config = configuration()
        if importlib.util.find_spec("pycolmap") is None:
            raise DomainError("请先安装 pycolmap CPU 包。", "RECONSTRUCTION_UNAVAILABLE")
        tool_paths(config)
        return {"available": True, "message": "本地通用表面重建已配置", "min_photos": config["min_photos"], "max_photos": config["max_photos"]}
    except (DomainError, OSError, ValueError) as error:
        return {"available": False, "message": str(error), "min_photos": 3, "max_photos": 96}
