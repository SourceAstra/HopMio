"""本项目的模型注册表；密钥通过环境变量或系统凭据库提供。"""

import os
import re
from pathlib import Path
from ..contracts import DomainError


def _default_config_path():
    p = Path(__file__).resolve()
    for parent in p.parents:
        if (parent / "config" / "models.yaml").is_file():
            return str(parent / "config" / "models.yaml")
    return str(p.parents[2] / "config" / "models.yaml")

def load_model():
    location = os.environ.get("YAHA_MODEL_CONFIG", _default_config_path())
    try:
        import yaml

        file = Path(location).expanduser()
        if file.stat().st_size > 1024 * 1024:
            raise ValueError("配置过大")
        data = yaml.safe_load(file.read_text(encoding="utf-8"))
        if data.get("schema_version") != "yaha.models/v1":
            raise ValueError("版本不支持")
        alias = os.environ.get("YAHA_MODEL_ALIAS", data["default_model"])
        entries = [item for item in data["models"] if item.get("model_alias", item.get("model")) == alias]
        if len(entries) != 1:
            raise ValueError("模型别名不存在或不唯一")
        item = entries[0]
        if item.get("protocol", "chat") not in ("chat", "messages"):
            raise ValueError("只支持 chat 或 messages 协议")
        if not item["model_url"].startswith("https://"):
            raise ValueError("服务必须使用 HTTPS")
        key_reference = item.get("model_key", "")
        if key_reference and not re.fullmatch(r"\$\{[A-Za-z_][A-Za-z_0-9]*\}", key_reference):
            raise ValueError("密钥必须引用环境变量")
        key = re.sub(r"\$\{([A-Za-z_][A-Za-z_0-9]*)\}", lambda match: os.environ.get(match[1], ""), key_reference)
        timeout, tokens = item.get("timeout_seconds", 300), item.get("max_tokens", 8192)
        if not 30 <= timeout <= 600 or not 1024 <= tokens <= 32768:
            raise ValueError("模型等待时间或输出预算超出范围")
        effort = item.get("reasoning_effort")
        if effort not in (None, "low", "medium", "high", "max"):
            raise ValueError("思考强度超出范围")
        return {"chat_url": item["model_url"], "chat_model": item["model"], "chat_protocol": item.get("protocol", "chat"), "key": key, "account": alias, "supports_images": item.get("supports_images", False), "timeout_seconds": timeout, "max_tokens": tokens, "reasoning_effort": effort}
    except Exception:
        raise DomainError("无法读取 config/models.yaml，请检查配置版本、别名、HTTPS 地址和协议。", "AI_CONFIG") from None
