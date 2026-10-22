"""TC-M / TC-V 系列：素材目录（materials.py）与作品会话（conversations.py）。"""

import pytest

from yaha.contracts import DomainError


def msg(mid, sender="user", content="你好", **extra):
    return {"id": mid, "sender": sender, "content": content, **extra}


def folder(fid="我的素材", name="我的素材夹"):
    return {"id": fid, "name": name, "emoji": "🎨", "description": "", "isBuiltIn": False, "colorScheme": "amber"}


class TestMaterials:
    def test_tc_m_001_default_library(self, service):
        """TC-M-001 初始素材目录为空库 schema v1。"""
        library = service.call("materials.get", {})
        assert library["schema_version"] == 1
        assert library["folders"] == [] and library["assignments"] == {}
        assert library["version"] == 0

    def test_tc_m_002_save_increments_version(self, service):
        """TC-M-002 保存目录后版本号自增，可回读。"""
        saved = service.call("materials.save", {
            "schema_version": 1, "version": 0, "folders": [folder()],
            "assignments": {"asset-1": "我的素材"},
        })
        assert saved["version"] == 1
        again = service.call("materials.get", {})
        assert again["version"] == 1 and again["folders"][0]["id"] == "我的素材"

    def test_tc_m_003_duplicate_folder_ids_rejected(self, service):
        """TC-M-003 文件夹标识重复被拒绝。"""
        with pytest.raises(DomainError, match="素材文件夹标识重复"):
            service.call("materials.save", {
                "schema_version": 1, "version": 0,
                "folders": [folder("x", "甲"), folder("x", "乙")], "assignments": {},
            })

    def test_tc_m_004_builtin_folder_id_rejected(self, service):
        """TC-M-004 自定义文件夹不允许占用内置标识。"""
        with pytest.raises(DomainError, match="素材文件夹标识重复"):
            service.call("materials.save", {
                "schema_version": 1, "version": 0, "folders": [folder("photos", "照片")],
                "assignments": {},
            })

    def test_tc_m_005_assignment_to_unknown_folder_rejected(self, service):
        """TC-M-005 素材不能引用不存在的文件夹。"""
        with pytest.raises(DomainError, match="素材引用了不存在的文件夹"):
            service.call("materials.save", {
                "schema_version": 1, "version": 0, "folders": [folder()],
                "assignments": {"asset-1": "不存在"},
            })

    def test_tc_m_006_assignment_to_all_is_rejected(self, service):
        """TC-M-006 all 是聚合视图，不能作为素材归属目标。"""
        with pytest.raises(DomainError, match="素材引用了不存在的文件夹"):
            service.call("materials.save", {
                "schema_version": 1, "version": 0, "folders": [folder()],
                "assignments": {"asset-1": "all"},
            })

    def test_tc_m_007_version_conflict_detected(self, service):
        """TC-M-007 并发保存旧版本被拒绝（乐观锁）。"""
        service.call("materials.save", {
            "schema_version": 1, "version": 0, "folders": [folder()], "assignments": {},
        })
        with pytest.raises(DomainError, match="素材目录已被其他页面更新"):
            service.call("materials.save", {
                "schema_version": 1, "version": 0, "folders": [folder("y", "另一个")],
                "assignments": {},
            })

    def test_tc_m_008_folder_extra_field_rejected(self, service):
        """TC-M-008 文件夹契约拒绝未知字段。"""
        bad = folder()
        bad["hack"] = True
        with pytest.raises(Exception):
            service.call("materials.save", {
                "schema_version": 1, "version": 0, "folders": [bad], "assignments": {},
            })

    def test_tc_m_009_builtin_targets_allowed(self, service):
        """TC-M-009 photos/drawings/models/multiview 内置夹可作为归属目标。"""
        saved = service.call("materials.save", {
            "schema_version": 1, "version": 0, "folders": [],
            "assignments": {"a1": "photos", "a2": "drawings", "a3": "models", "a4": "multiview"},
        })
        assert saved["version"] == 1


class TestConversations:
    def test_tc_v_001_default_conversation(self, service):
        """TC-V-001 新作品会话为空，版本 0。"""
        project = service.call("project.create", {"name": "会话作品", "spec": {}})
        conversation = service.call("conversation.get", {"project_id": project["id"]})
        assert conversation == {"version": 0, "messages": []}

    def test_tc_v_002_save_roundtrip_increments_version(self, service):
        """TC-V-002 保存会话成功且版本递增，可回读。"""
        project = service.call("project.create", {"name": "会话作品", "spec": {}})
        result = service.call("conversation.save", {
            "project_id": project["id"], "expected_version": 0,
            "messages": [msg("m1"), msg("m2", sender="assistant")],
        })
        assert result == {"version": 1}
        conversation = service.call("conversation.get", {"project_id": project["id"]})
        assert conversation["version"] == 1 and len(conversation["messages"]) == 2

    def test_tc_v_003_version_conflict(self, service):
        """TC-V-003 过期版本保存被拒绝（多窗口保护）。"""
        project = service.call("project.create", {"name": "会话作品", "spec": {}})
        service.call("conversation.save", {
            "project_id": project["id"], "expected_version": 0, "messages": [msg("m1")],
        })
        with pytest.raises(DomainError, match="已在其他窗口更新"):
            service.call("conversation.save", {
                "project_id": project["id"], "expected_version": 0, "messages": [msg("m2")],
            })

    def test_tc_v_004_invalid_message_shape(self, service):
        """TC-V-004 消息缺字段/未知发送者/非列表均被拒绝。"""
        project = service.call("project.create", {"name": "会话作品", "spec": {}})
        bad_sets = [
            "不是列表",
            [{"id": "m1", "sender": "hacker", "content": "x"}],
            [{"sender": "user", "content": "x"}],  # 缺少字符串 id
        ]
        for messages in bad_sets:
            with pytest.raises(DomainError, match="作品对话格式无效"):
                service.call("conversation.save", {
                    "project_id": project["id"], "expected_version": 0, "messages": messages,
                })

    def test_tc_v_005_conversation_of_missing_project(self, service):
        """TC-V-005 会话读写都要求作品存在。"""
        with pytest.raises(DomainError):
            service.call("conversation.get", {"project_id": "ghost"})

    def test_tc_v_006_bounded_history_filters_and_caps(self, service):
        """TC-V-006 bounded_history 只留 user/assistant 非空文本，至多 1000 条。"""
        from yaha.storage.conversations import bounded_history
        noisy = [{"role": "system", "content": "sys"}] + [
            {"role": "user" if i % 2 else "assistant", "content": f"m{i}"} for i in range(1200)
        ] + [{"role": "user", "content": ""}]
        history = bounded_history(noisy)
        assert 0 < len(history) <= 1000
        assert all(item["role"] in ("user", "assistant") and item["content"] for item in history)
        assert history[0]["content"] == "m201"  # 只保留最后 1000 条窗口内的有效项
        assert bounded_history("乱输入") == []
        assert bounded_history([{"role": "user", "content": "只有一条"}]) == [
            {"role": "user", "content": "只有一条"}
        ]

    def test_tc_v_007_stored_context_finds_pending_proposal(self, service):
        """TC-V-007 stored_context 抽取会话历史并按版本匹配未应用提案。"""
        from yaha.storage.conversations import stored_context
        messages = [
            {"sender": "user", "content": "把耳朵调大"},
            {"sender": "assistant", "content": "忽略这个", "proposal": {"applied": True, "summary": "已应用"}},
            {"sender": "assistant", "content": "占位", "proposal": {"superseded": True, "summary": "已替代"}},
            {"sender": "assistant", "content": "占位", "proposal": {"summary": "待应用", "instruction": "耳朵+20%", "revision": "rev-7"}},
        ]
        history, pending = stored_context(messages, "rev-7")
        assert {"role": "user", "content": "把耳朵调大"} in history
        assert pending and pending["instruction"] == "耳朵+20%"
        _, no_pending = stored_context(messages, "rev-other")
        assert no_pending is None
