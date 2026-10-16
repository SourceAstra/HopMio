"""本项目的模型注册表；密钥通过环境变量或系统凭据库提供。"""

import os
import re
from pathlib import Path
from ..contracts import DomainError
from .model_options import model_options


def _default_config_path():
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "config" / "models.yaml").is_file():
            return str(parent / "config" / "models.yaml")
    return str(p.parents[2] / "config" / "models.yaml")

def load_model(alias=None):
    location = os.environ.get("YAHA_MODEL_CONFIG", _default_config_path())
    try:
        import yaml

        file = Path(location).expanduser()
        if not file.is_file() or file.stat().st_size > 1024 * 1024:
            return None
        data = yaml.safe_load(file.read_text(encoding="utf-8"))
        if data.get("schema_version") != "yaha.models/v1":
            return None
        target_alias = alias or os.environ.get("YAHA_MODEL_ALIAS", data.get("default_model"))
        entries = [item for item in data.get("models", []) if item.get("model_alias", item.get("model")) == target_alias]
        if len(entries) != 1:
            return None
        item = entries[0]
        if item.get("protocol", "chat") not in ("chat", "messages"):
            return None
        if not item.get("model_url", "").startswith("https://"):
            return None
        key_reference = item.get("model_key", "")
        if key_reference and not re.fullmatch(r"\$\{[A-Za-z_][A-Za-z_0-9]*\}", key_reference):
            key = ""
        else:
            key = re.sub(r"\$\{([A-Za-z_][A-Za-z_0-9]*)\}", lambda match: os.environ.get(match[1], ""), key_reference)
        return model_options(item) | {
            "chat_url": item["model_url"],
            "chat_model": item["model"],
            "chat_protocol": item.get("protocol", "chat"),
            "key": key,
            "account": target_alias,
            "supports_images": item.get("supports_images", False),
        }
    except Exception:
        return None

def list_models():
    location = os.environ.get("YAHA_MODEL_CONFIG", _default_config_path())
    try:
        import yaml

        file = Path(location).expanduser()
        if not file.is_file() or file.stat().st_size > 1024 * 1024:
            return []
        data = yaml.safe_load(file.read_text(encoding="utf-8"))
        if data.get("schema_version") != "yaha.models/v1":
            return []
        res = []
        for item in data.get("models", []):
            alias = item.get("model_alias", item.get("model"))
            key_reference = item.get("model_key", "")
            key = (
                re.sub(r"\$\{([A-Za-z_][A-Za-z_0-9]*)\}", lambda match: os.environ.get(match[1], ""), key_reference)
                if key_reference
                else ""
            )
            res.append({
                "id": alias,
                "name": alias,
                "alias": alias,
                "model": item.get("model"),
                "url": item.get("model_url"),
                "protocol": item.get("protocol", "chat"),
                "supports_images": bool(item.get("supports_images", False)),
                "key": key,
            })
        return res
    except Exception:
        return []
