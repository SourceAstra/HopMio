"""集中配置传输保护与对话裁剪，不把字节数当作模型上下文 token。"""
from functools import lru_cache
from pathlib import Path
import yaml
from ..contracts import DomainError


@lru_cache(maxsize=1)
def ai_limits():
    defaults = {
        "response": {"event_max_bytes": 1048576, "wire_bytes_per_token": 2048, "text_characters_per_token": 16},
    }
    path = next((p / "config" / "ai.yaml" for p in Path(__file__).resolve().parents if (p / "config" / "ai.yaml").is_file()), None)
    if path:
        try:
            config = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            for section, fields in defaults.items():
                for key in fields:
                    value = config.get(section, {}).get(key, fields[key])
                    if type(value) is not int or not 1 <= value <= 16 * 1024 * 1024:
                        raise ValueError(key)
                    fields[key] = value
        except (ValueError, TypeError, AttributeError, yaml.YAMLError):
            raise DomainError("AI 接收与对话配置无效，请检查 config/ai.yaml。", "AI_CONFIG") from None
    return defaults


def response_limits(max_tokens):
    config = ai_limits()["response"]
    return {
        "max_event_bytes": config["event_max_bytes"],
        "max_wire_bytes": min(128 * 1024 * 1024, max(8 * 1024 * 1024, max_tokens * config["wire_bytes_per_token"])),
        "max_text_chars": min(8 * 1024 * 1024, max(256 * 1024, max_tokens * config["text_characters_per_token"])),
    }
