"""家长解锁、密钥保管和云端额度限制。"""

import hashlib
import hmac
import os
import secrets
import time
import keyring
from .contracts import DomainError

DEFAULTS = {
    "cloud_enabled": False,
    "daily_limit": 5,
    "meshy_model": "meshy-7.1",
    "chat_url": "",
    "chat_model": "",
    "theme": "sunshine",
}


class Settings:
    def __init__(self, db):
        self.db = db
        self.tokens = {}

    def values(self):
        return DEFAULTS | (self.db.get("settings", "preferences") or {})

    def key(self, provider):
        try:
            value = keyring.get_password("YaHaCraft", provider)
        except Exception:
            value = None
        return value or os.environ.get(
            {"meshy": "MESHY_API_KEY", "chat": "YAHA_AI_API_KEY"}[provider], ""
        )

    def public(self):
        return self.values() | {
            "pin_set": bool(self.db.get("settings", "guardian")),
            "meshy_configured": bool(self.key("meshy")),
            "chat_configured": bool(self.key("chat")),
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
        for provider in ("meshy", "chat"):
            if values.get(provider + "_key"):
                try:
                    keyring.set_password(
                        "YaHaCraft", provider, values[provider + "_key"]
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
