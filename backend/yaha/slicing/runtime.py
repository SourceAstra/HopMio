import json
import os
from pathlib import Path
import yaml
from ..modeling.runtime import ROOT
from ..contracts import DomainError


def configuration():
    try:
        config = yaml.safe_load((ROOT / "config/slicing.yaml").read_text(encoding="utf-8"))
        if config["schema_version"] != "yaha.slicing/v1" or not 30 <= config["timeout_seconds"] <= 3600 or not 0 <= config["brim_width_mm"] <= 20 or not 1 <= config["wall_loops"] <= 10 or config["support_type"] not in ("tree(auto)", "normal(auto)"):
            raise ValueError()
        parent = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "yaha-craft/slicing/02.08.02.61"
        metadata = json.loads((parent / "installation.json").read_text()) if (parent / "installation.json").is_file() else {}
        executable = parent / metadata["executable"] if config["bambu_path"] == "auto" else Path(config["bambu_path"]).expanduser()
        profiles = parent / metadata["profiles"] if config["profiles_path"] == "auto" else Path(config["profiles_path"]).expanduser()
        if not executable.is_file() or not (profiles / "BBL/machine/Bambu Lab A1 mini 0.4 nozzle.json").is_file():
            raise FileNotFoundError()
        return config | {"executable": str(executable.resolve()), "profiles": str(profiles.resolve()), "version": metadata.get("version", "external")}
    except (OSError, KeyError, ValueError, TypeError, yaml.YAMLError):
        raise DomainError("未找到有效 Bambu Studio 与 A1 mini 参数库，请运行安装切片入口或配置 config/slicing.yaml。", "SLICER_UNAVAILABLE") from None


def availability():
    try:
        config = configuration()
        return {"available": True, "version": config["version"], "executable": config["executable"], "message": "A1 mini 本地切片已配置"}
    except DomainError as error:
        return {"available": False, "message": str(error)}
