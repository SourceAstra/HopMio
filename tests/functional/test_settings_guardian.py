"""TC-S 系列：设置、家长解锁、专属打印密码与云端额度（settings.py）。"""

import pytest

from yaha.contracts import DomainError


@pytest.fixture
def fake_keyring(monkeypatch):
    """用内存字典替换系统凭据库，避免测试污染真实钥匙串。"""
    import yaha.settings as settings_module
    store = {}

    class FakeKeyring:
        @staticmethod
        def get_password(service, username):
            return store.get((service, username))

        @staticmethod
        def set_password(service, username, password):
            store[(service, username)] = password

    monkeypatch.setattr(settings_module, "keyring", FakeKeyring)
    return store


class TestDefaultsAndUnlock:
    def test_tc_s_001_public_defaults(self, service, fake_keyring):
        """TC-S-001 初始设置：云端关闭、日限 5、未设任何密码。"""
        public = service.settings.public()
        assert public["cloud_enabled"] is False
        assert public["daily_limit"] == 5
        assert public["pin_set"] is False
        assert public["print_pin_set"] is False
        assert public["theme"] == "sunshine"
        assert isinstance(public["models"], list) and public["models"]

    def test_tc_s_002_first_unlock_sets_guardian(self, service, fake_keyring):
        """TC-S-002 首次解锁即设定家长密码并发放 10 分钟令牌。"""
        result = service.settings.unlock("123456")
        assert result["expires_in"] == 600 and result["token"]
        assert service.settings.public()["pin_set"] is True
        service.settings.require(result["token"])

    def test_tc_s_003_wrong_pin_rejected(self, service, fake_keyring):
        """TC-S-003 错误家长密码被拒绝。"""
        service.settings.unlock("123456")
        with pytest.raises(DomainError, match="原家长密码不正确"):
            service.settings.unlock("654321")

    def test_tc_s_004_pin_length_policy(self, service, fake_keyring):
        """TC-S-004 密码长度必须 6..32。"""
        with pytest.raises(DomainError, match="请使用 6 至 32 位家长密码"):
            service.settings.unlock("12345")
        with pytest.raises(DomainError, match="请使用 6 至 32 位家长密码"):
            service.settings.unlock("长" * 33)

    def test_tc_s_005_change_pin(self, service, fake_keyring):
        """TC-S-005 解锁时可顺带换密码：旧密码失效，新密码可用。"""
        service.settings.unlock("123456", new_pin="abcdef")
        with pytest.raises(DomainError, match="原家长密码不正确"):
            service.settings.unlock("123456")
        service.settings.unlock("abcdef")

    def test_tc_s_006_change_pin_length_validated(self, service, fake_keyring):
        """TC-S-006 新密码长度不合规时报错且原密码仍可用。"""
        service.settings.unlock("123456")
        with pytest.raises(DomainError, match="新密码长度需在 6 至 32 位之间"):
            service.settings.unlock("123456", new_pin="123")
        service.settings.unlock("123456")

    def test_tc_s_007_expired_token_rejected(self, service, fake_keyring, monkeypatch):
        """TC-S-007 过期令牌触发 GUARDIAN_REQUIRED。"""
        import time
        token = service.settings.unlock("123456")["token"]
        service.settings.tokens[token] = time.monotonic() - 1
        with pytest.raises(DomainError, match="请先输入家长密码解锁"):
            service.settings.require(token)


class TestSettingsUpdate:
    def test_tc_s_008_update_without_guardian_allowed(self, service, fake_keyring):
        """TC-S-008 未设家长密码时可直接修改设置（首次配置）。"""
        public = service.settings.update("", {"cloud_enabled": True, "daily_limit": 3})
        assert public["cloud_enabled"] is True and public["daily_limit"] == 3

    def test_tc_s_009_update_requires_token_once_guardian_set(self, service, fake_keyring):
        """TC-S-009 设了家长密码后，改设置必须携带有效令牌。"""
        service.settings.unlock("123456")
        with pytest.raises(DomainError, match="请先输入家长密码解锁"):
            service.settings.update("", {"cloud_enabled": True})
        token = service.settings.unlock("123456")["token"]
        assert service.settings.update(token, {"theme": "night"})["theme"] == "night"

    def test_tc_s_010_daily_limit_bounds(self, service, fake_keyring):
        """TC-S-010 每日限额 0..999，非法值被拒绝。"""
        for bad in (-1, 1000, "很多"):
            with pytest.raises(DomainError, match="每日云端任务上限"):
                service.settings.update("", {"daily_limit": bad})
        assert service.settings.update("", {"daily_limit": 0})["daily_limit"] == 0
        assert service.settings.update("", {"daily_limit": 999})["daily_limit"] == 999

    def test_tc_s_011_model_url_must_be_https(self, service, fake_keyring):
        """TC-S-011 自定义模型服务地址必须 HTTPS。"""
        with pytest.raises(DomainError, match="必须使用 HTTPS"):
            service.settings.update("", {"models": [{
                "id": "local-1", "name": "本地", "url": "http://127.0.0.1:8000",
                "model": "demo", "protocol": "chat",
            }]})

    def test_tc_s_012_model_validation_rules(self, service, fake_keyring):
        """TC-S-012 模型清单：空 id/重复 id/非法协议/空模型名 均被拒绝。"""
        good = {"id": "m1", "name": "模型一", "url": "https://api.example.com", "model": "demo", "protocol": "chat"}
        no_id = dict(good, id="")
        bad_protocol = dict(good, protocol="graphql")
        no_model = dict(good, model="")
        bad_sets = [
            [no_id],
            [good, good],
            [bad_protocol],
            [no_model],
            [],
        ]
        for models in bad_sets:
            with pytest.raises(DomainError):
                service.settings.update("", {"models": models})
        public = service.settings.update("", {"models": [good]})
        assert public["models"][0]["id"] == "m1"

    def test_tc_s_013_active_model_switch(self, service, fake_keyring):
        """TC-S-013 可切换激活模型到清单内 id。"""
        models = [
            {"id": "a", "name": "A", "url": "https://a.example.com", "model": "a", "protocol": "chat"},
            {"id": "b", "name": "B", "url": "https://b.example.com", "model": "b", "protocol": "messages"},
        ]
        public = service.settings.update("", {"models": models, "active_model": "b"})
        assert public["active_model"] == "b"
        assert public["chat_model"] == "b"

    def test_tc_s_014_model_key_saved_into_keyring(self, service, fake_keyring):
        """TC-S-014 模型密钥写入系统凭据库而非数据库或源码。"""
        service.settings.update("", {"model_keys": {"m1": " sk-secret "}})
        assert fake_keyring[("YaHaCraft", "chat:m1")] == "sk-secret"
        assert "sk-secret" not in str(service.db.get("settings", "preferences"))


class TestPrintPin:
    def test_tc_s_015_first_print_pin_auto_set(self, service, fake_keyring):
        """TC-S-015 首次输入打印密码即自动设定为专属打印密码。"""
        assert service.settings.verify_print_pin("999888") is True
        assert service.settings.public()["print_pin_set"] is True
        assert service.settings.verify_print_pin("999888") is True

    def test_tc_s_016_wrong_print_pin_rejected(self, service, fake_keyring):
        """TC-S-016 错误打印密码被拒绝。"""
        service.settings.verify_print_pin("999888")
        with pytest.raises(DomainError, match="打印密码不正确"):
            service.settings.verify_print_pin("000111")

    def test_tc_s_017_print_pin_length_policy(self, service, fake_keyring):
        """TC-S-017 打印密码长度必须 6..32。"""
        with pytest.raises(DomainError, match="6 至 32 位"):
            service.settings.verify_print_pin("12345")

    def test_tc_s_018_set_print_pin_via_unlock_action(self, service, fake_keyring):
        """TC-S-018 家长解锁后可通过 set_print_pin 动作重设打印密码。"""
        token = service.settings.unlock("123456")["token"]
        result = service.call("settings.unlock", {
            "token": token, "action": "set_print_pin", "new_print_pin": "print-pin-1",
        })
        assert result["print_pin_set"] is True
        assert service.settings.verify_print_pin("print-pin-1")
        with pytest.raises(DomainError, match="请输入新的专属打印密码"):
            service.call("settings.unlock", {"token": token, "action": "set_print_pin"})


class TestCloudQuota:
    def test_tc_s_019_reserve_when_cloud_disabled(self, service, fake_keyring):
        """TC-S-019 云端未开启时预约报 AI_DISABLED（家长门禁）。"""
        with pytest.raises(DomainError) as exc:
            service.settings.reserve_cloud("chat")
        assert exc.value.code == "AI_DISABLED"

    def test_tc_s_020_reserve_without_key(self, service, fake_keyring, monkeypatch):
        """TC-S-020 云端开启但没有密钥时报 AI_REQUIRED。"""
        service.settings.update("", {"cloud_enabled": True})
        monkeypatch.delenv("YAHA_AI_API_KEY", raising=False)
        with pytest.raises(DomainError) as exc:
            service.settings.reserve_cloud("chat")
        assert exc.value.code == "AI_REQUIRED"

    def test_tc_s_021_daily_quota_exhaustion(self, service, fake_keyring, monkeypatch):
        """TC-S-021 云端额度按天计数，用完即拒绝。"""
        service.settings.update("", {"cloud_enabled": True, "daily_limit": 2})
        monkeypatch.setenv("YAHA_AI_API_KEY", "test-key")
        service.settings.reserve_cloud("chat")
        service.settings.reserve_cloud("chat")
        with pytest.raises(DomainError, match="用完了"):
            service.settings.reserve_cloud("chat")

    def test_tc_s_022_unlimited_quota(self, service, fake_keyring, monkeypatch):
        """TC-S-022 daily_limit=0 表示不限制。"""
        service.settings.update("", {"cloud_enabled": True, "daily_limit": 0})
        monkeypatch.setenv("YAHA_AI_API_KEY", "test-key")
        for _ in range(5):
            service.settings.reserve_cloud("chat")

    def test_tc_s_023_converse_local_fallback_when_cloud_disabled(self, service, fake_keyring):
        """TC-S-023 云端未开启时对话退回本地规则整理，不调用云端。"""
        spec = service.projects.list()[0]["spec"]
        from yaha.ai.conversation import converse
        result = converse("做一个 60mm 高的笔筒", spec, service.settings, service.assets)
        assert result["action"] == "create"
        assert "本地规则" in result["summary"]
        design = result["design"]
        assert design["template"] == "cup"
        assert design["height_mm"] == 60

    def test_tc_s_024_converse_asks_guardian_for_editable_spec(self, service, fake_keyring):
        """TC-S-024 已有参数方案的作品在云端关闭时提示家长开启，而不是本地造物。"""
        spec = service.projects.list()[0]["spec"] | {
            "provider": "parametric",
            "modeling_plan": {"schema_version": 8, "title": "x", "parameters": {}, "steps": [], "constraints": []},
        }
        from yaha.ai.conversation import converse
        result = converse("再改改", spec, service.settings, service.assets)
        assert result == {"action": "ask", "summary": "请先在家长设置中开启云端 AI，我才能结合当前模型讨论修改。"}
