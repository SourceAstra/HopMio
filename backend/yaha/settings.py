"""家长解锁、密钥保管和云端额度限制。"""

import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlsplit
import keyring
from .contracts import DomainError
from .ai.model_registry import load_model

DEFAULTS = {
    "cloud_enabled": False,
    "daily_limit": 5,
    "chat_url": "",
    "chat_model": "",
    "chat_protocol": "chat",
    "theme": "sunshine",
}


class Settings:
    def __init__(self, db):
        self.db = db
        self.tokens = {}
        self.imported_model = load_model()

    def values(self):
        saved = self.db.get("settings", "preferences") or {}
        values = DEFAULTS | {key: saved[key] for key in DEFAULTS if key in saved}
        if self.imported_model:
            values.update(
                {name: self.imported_model[name] for name in ("chat_url", "chat_model", "chat_protocol")}
            )
        return values

    def key(self, provider):
        if provider != "chat":
            raise DomainError("不支持这个 AI 密钥类型。", "AI_CONFIG")
        if provider == "chat" and self.imported_model and self.imported_model["key"]:
            return self.imported_model["key"]
        try:
            account = "chat:" + self.imported_model["account"] if self.imported_model else "chat"
            value = keyring.get_password("YaHaCraft", account)
            if not value and self.imported_model and urlsplit(self.imported_model["chat_url"]).hostname == "open.bigmodel.cn":
                value = keyring.get_password("YaHaCraft", "chat")
        except Exception:
            value = None
        return value or ("" if self.imported_model else os.environ.get("YAHA_AI_API_KEY", ""))

    def public(self):
        return self.values() | {
            "pin_set": bool(self.db.get("settings", "guardian")),
            "chat_configured": bool(self.key("chat")),
            "chat_registry_configured": bool(self.imported_model),
            "chat_supports_images": bool(self.imported_model and self.imported_model["supports_images"]),
        }

    def unlock(self, pin):
        if not isinstance(pin, str) or not pin.isdigit() or not 6 <= len(pin) <= 12:
            raise DomainError("请使用 6 至 12 位家长数字口令。")
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
            raise DomainError("家长口令不正确。")
        token = secrets.token_urlsafe(32)
        self.tokens[token] = time.monotonic() + 600
        return {"token": token, "expires_in": 600}

    def require(self, token):
        if self.tokens.get(token, 0) < time.monotonic():
            raise DomainError(
                "请先请家长解锁设置（解锁有效 10 分钟）。", "GUARDIAN_REQUIRED"
            )

    def update(self, token, values):
        self.require(token)
        prefs = self.values()
        for name in DEFAULTS:
            if name in values:
                prefs[name] = values[name]
        if (
            not isinstance(prefs["daily_limit"], int)
            or not 1 <= prefs["daily_limit"] <= 50
        ):
            raise DomainError("每日云端任务上限应为 1 至 50。")
        if prefs["chat_url"] and not prefs["chat_url"].startswith("https://"):
            raise DomainError("AI 服务地址必须使用 HTTPS。")
        if prefs["chat_protocol"] not in ("chat", "messages"):
            raise DomainError("请选择 Chat Completions 或 Messages 协议。")
        for provider in ("chat",):
            if values.get(provider + "_key"):
                try:
                    keyring.set_password(
                        "YaHaCraft", "chat:" + self.imported_model["account"] if self.imported_model else provider, values[provider + "_key"]
                    )
                except Exception:
                    raise DomainError(
                        "系统凭据库不可用，密钥没有保存。可由家长使用环境变量配置。"
                    )
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
            if used >= self.values()["daily_limit"]:
                raise DomainError("今天的云端造物次数用完了，明天再来或使用本地模板。")
            self.db.put("settings", "quota", {"day": day, "used": used + 1})
