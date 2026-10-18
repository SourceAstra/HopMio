"""家长解锁、密钥保管和云端额度限制。"""

import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlsplit
import keyring
from .contracts import DomainError
from .ai.model_registry import load_model, list_models
from .ai.model_options import model_options

DEFAULTS = {
    "cloud_enabled": False,
    "daily_limit": 5,
    "theme": "sunshine",
    "active_model": "",
    "models": [],
}


class Settings:
    def __init__(self, db):
        self.db = db
        self.tokens = {}

    @property
    def imported_model(self):
        vals = self.values()
        active_id = vals.get("active_model", "")
        preset = load_model(active_id) if active_id else None
        active = next((m for m in vals.get("models", []) if m.get("id") == active_id), None)
        if active:
            return (preset or {}) | model_options(active, preset) | {
                "chat_url": active.get("url", ""),
                "chat_model": active.get("model", ""),
                "chat_protocol": active.get("protocol", "chat"),
                "supports_images": active.get("supports_images", True),
            }
        return load_model() or {}

    def get_models(self):
        saved = self.db.get("settings", "preferences") or {}
        models = saved.get("models")
        if not models:
            presets = list_models()
            models = [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "model": p["model"],
                    "url": p["url"],
                    "protocol": p["protocol"],
                    "supports_images": p["supports_images"],
                }
                for p in presets
            ]
            if not models:
                models = [
                    {
                        "id": "glm-5.3",
                        "name": "智谱 GLM-5.3",
                        "model": "glm-5.3",
                        "url": "https://open.bigmodel.cn/api/anthropic/v1/messages",
                        "protocol": "messages",
                        "supports_images": True,
                    }
                ]
        return models

    def values(self):
        saved = self.db.get("settings", "preferences") or {}
        values = DEFAULTS | {key: saved[key] for key in DEFAULTS if key in saved}
        models = self.get_models()
        values["models"] = models
        active_id = values.get("active_model")
        if not active_id or not any(m["id"] == active_id for m in models):
            active_id = models[0]["id"] if models else ""
            values["active_model"] = active_id
        active = next((m for m in models if m["id"] == active_id), models[0] if models else None)
        if active:
            values["chat_url"] = active.get("url", "")
            values["chat_model"] = active.get("model", "")
            values["chat_protocol"] = active.get("protocol", "chat")
            values["chat_supports_images"] = active.get("supports_images", True)
        else:
            values["chat_url"] = ""
            values["chat_model"] = ""
            values["chat_protocol"] = "chat"
            values["chat_supports_images"] = True
        return values

    def _has_key(self, model_id):
        try:
            val = keyring.get_password("YaHaCraft", f"chat:{model_id}")
            if val:
                return True
        except Exception:
            pass
        preset = load_model(model_id)
        if preset and preset.get("key"):
            return True
        try:
            if keyring.get_password("YaHaCraft", "chat"):
                return True
        except Exception:
            pass
        return bool(os.environ.get("YAHA_AI_API_KEY", ""))

    def key_for_model(self, model_id):
        try:
            value = keyring.get_password("YaHaCraft", f"chat:{model_id}")
            if value:
                return value
        except Exception:
            pass
        preset = load_model(model_id)
        return (preset or {}).get("key") or os.environ.get("YAHA_AI_API_KEY", "")

    def key(self, provider):
        if provider != "chat":
            raise DomainError("不支持这个 AI 密钥类型。", "AI_CONFIG")
        vals = self.values()
        active_id = vals.get("active_model", "")
        if active_id:
            try:
                val = keyring.get_password("YaHaCraft", f"chat:{active_id}")
                if val:
                    return val
            except Exception:
                pass
            preset = load_model(active_id)
            if preset and preset.get("key"):
                return preset["key"]
        try:
            val = keyring.get_password("YaHaCraft", "chat")
            if val:
                return val
        except Exception:
            pass
        return os.environ.get("YAHA_AI_API_KEY", "")

    def public(self):
        vals = self.values()
        models = [
            m | model_options(m, load_model(m["id"])) | {"has_key": self._has_key(m["id"])}
            for m in vals["models"]
        ]
        return vals | {
            "models": models,
            "pin_set": bool(self.db.get("settings", "guardian")),
            "print_pin_set": bool(self.db.get("settings", "print_guardian")),
            "chat_configured": bool(self.key("chat")),
            "chat_registry_configured": bool(self.imported_model),
            "chat_supports_images": vals.get("chat_supports_images", True),
        }

    def has_print_pin(self) -> bool:
        return bool(self.db.get("settings", "print_guardian"))

    def set_print_pin(self, new_pin: str):
        if not isinstance(new_pin, str) or not 6 <= len(new_pin) <= 32:
            raise DomainError("打印密码长度需在 6 至 32 位之间（支持大小写字母、数字及符号）。")
        salt = secrets.token_hex(16)
        guard = {
            "salt": salt,
            "hash": hashlib.pbkdf2_hmac(
                "sha256", new_pin.encode(), salt.encode(), 200000
            ).hex(),
        }
        self.db.put("settings", "print_guardian", guard)
        return {"print_pin_set": True}

    def verify_print_pin(self, pin: str) -> bool:
        if not isinstance(pin, str) or not 6 <= len(pin) <= 32:
            raise DomainError("请使用 6 至 32 位打印密码。")
        guard = self.db.get("settings", "print_guardian")
        if not guard:
            # 首次输入时自动设定为专属打印密码
            self.set_print_pin(pin)
            return True
        digest = hashlib.pbkdf2_hmac(
            "sha256", pin.encode(), guard["salt"].encode(), 200000
        ).hex()
        if not hmac.compare_digest(digest, guard["hash"]):
            time.sleep(1)
            raise DomainError("打印密码不正确，请重新输入。")
        return True

    def unlock(self, pin, new_pin=None):
        if not isinstance(pin, str) or not 6 <= len(pin) <= 32:
            raise DomainError("请使用 6 至 32 位家长密码（支持大小写字母、数字及符号）。")
        guard = self.db.get("settings", "guardian")
        if not guard:
            salt = secrets.token_hex(16)
            guard = {
                "salt": salt,
                "hash": hashlib.pbkdf2_hmac(
                    "sha256", pin.encode(), salt.encode(), 200000
                ).hex(),
            }
            self.db.put("settings", "guardian", guard)
        digest = hashlib.pbkdf2_hmac(
            "sha256", pin.encode(), guard["salt"].encode(), 200000
        ).hex()
        if not hmac.compare_digest(digest, guard["hash"]):
            time.sleep(1)
            raise DomainError("原家长密码不正确，请重新输入。")

        if new_pin is not None:
            if not isinstance(new_pin, str) or not 6 <= len(new_pin) <= 32:
                raise DomainError("新密码长度需在 6 至 32 位之间（支持大小写字母、数字及符号）。")
            new_salt = secrets.token_hex(16)
            new_guard = {
                "salt": new_salt,
                "hash": hashlib.pbkdf2_hmac(
                    "sha256", new_pin.encode(), new_salt.encode(), 200000
                ).hex(),
            }
            self.db.put("settings", "guardian", new_guard)

        token = secrets.token_urlsafe(32)
        self.tokens[token] = time.monotonic() + 600
        return {"token": token, "expires_in": 600}

    def require(self, token):
        if self.tokens.get(token, 0) < time.monotonic():
            raise DomainError(
                "请先输入家长密码解锁设置。", "GUARDIAN_REQUIRED"
            )

    def update(self, token, values):
        if bool(self.db.get("settings", "guardian")):
            self.require(token)
        prefs = self.values()
        if "daily_limit" in values:
            limit = values["daily_limit"]
            if not isinstance(limit, int) or limit < 0 or limit > 999:
                raise DomainError("每日云端任务上限应为 0 至 999（0 表示不限制）。")
            prefs["daily_limit"] = limit
        if "cloud_enabled" in values:
            prefs["cloud_enabled"] = bool(values["cloud_enabled"])
        if "theme" in values:
            prefs["theme"] = str(values["theme"])

        if "models" in values:
            from .ai.model_probe import service_url
            raw_models = values["models"]
            if not isinstance(raw_models, list) or not 1 <= len(raw_models) <= 200:
                raise DomainError("模型配置列表至少需要保留一个模型。")
            validated_models = []
            for item in raw_models:
                if not isinstance(item, dict):
                    raise DomainError("模型配置格式不正确。")
                m_id = str(item.get("id") or item.get("alias") or "").strip()
                name = str(item.get("name") or m_id).strip()
                url = str(item.get("url") or item.get("chat_url") or "").strip()
                model_name = str(item.get("model") or item.get("chat_model") or "").strip()
                protocol = str(item.get("protocol") or item.get("chat_protocol") or "chat").strip()
                if not m_id:
                    raise DomainError("模型标识不能为空。")
                if any(m["id"] == m_id for m in validated_models):
                    raise DomainError("候选模型标识重复。")
                if not url.startswith("https://"):
                    raise DomainError(f"模型【{name}】的服务地址必须使用 HTTPS。")
                if protocol not in ("chat", "messages"):
                    raise DomainError(f"模型【{name}】请选择 Chat Completions 或 Messages 协议。")
                if not model_name:
                    raise DomainError(f"模型【{name}】的模型名称不能为空。")
                validated_models.append(model_options(item, load_model(m_id)) | {
                    "id": m_id,
                    "name": name,
                    "url": service_url(url),
                    "model": model_name,
                    "protocol": protocol,
                    "supports_images": bool(item.get("supports_images", True)),
                })
            prefs["models"] = validated_models

        if "active_model" in values:
            target = str(values["active_model"]).strip()
            if target and any(m["id"] == target for m in prefs["models"]):
                prefs["active_model"] = target

        model_keys = values.get("model_keys") or {}
        for mid, key_val in model_keys.items():
            if key_val and str(key_val).strip():
                try:
                    keyring.set_password("YaHaCraft", f"chat:{mid}", str(key_val).strip())
                except Exception:
                    raise DomainError("系统凭据库不可用，密钥没有保存。")

        if values.get("chat_key") and str(values["chat_key"]).strip():
            active_id = prefs.get("active_model")
            key_val = str(values["chat_key"]).strip()
            try:
                if active_id:
                    keyring.set_password("YaHaCraft", f"chat:{active_id}", key_val)
                keyring.set_password("YaHaCraft", "chat", key_val)
            except Exception:
                raise DomainError("系统凭据库不可用，密钥没有保存。")

        self.db.put("settings", "preferences", prefs)
        return self.public()

    def reserve_cloud(self, provider):
        if not self.values()["cloud_enabled"]:
            raise DomainError("云端造物还没开启，请家长在设置中开启。", "AI_DISABLED")
        if not self.key(provider):
            raise DomainError("还没有配置对应 AI 服务密钥。", "AI_REQUIRED")
        day = time.strftime("%Y-%m-%d")
        with self.db.transaction():
            count = self.db.get("settings", "quota") or {}
            used = count.get("used", 0) if count.get("day") == day else 0
            limit = self.values().get("daily_limit", 5)
            if limit > 0 and used >= limit:
                raise DomainError(f"今天的云端造物次数（{limit} 次）用完了，明天再来或在设置中提高上限。")
            self.db.put("settings", "quota", {"day": day, "used": used + 1})
