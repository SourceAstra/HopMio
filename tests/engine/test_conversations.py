from types import SimpleNamespace
import pytest
from yaha.contracts import DomainError
from yaha.storage.database import Database
from yaha.storage.conversations import Conversations, stored_context
from yaha.ai import understanding
from yaha.modeling.design_review import require_adjustment_acceptance


def test_conversation_is_persisted_scoped_and_versioned(tmp_path):
    db = Database(tmp_path)
    projects = SimpleNamespace(get=lambda identifier: {"id": identifier})
    store = Conversations(db, projects)
    messages = [{"id": "one", "sender": "user", "content": "加镂空文字Usagi"}]
    assert store.save("project-a", messages, 0) == {"version": 1}
    assert store.get("project-b")["messages"] == []
    with pytest.raises(DomainError) as error:
        store.save("project-a", [], 0)
    assert error.value.code == "CONVERSATION_CONFLICT"
    db.close()
    db = Database(tmp_path)
    assert Conversations(db, projects).get("project-a")["messages"] == messages
    db.close()


def test_followup_includes_history_and_pending_requirements(monkeypatch):
    seen = {}
    def complete(self, system, prompt, images):
        seen.update(system=system, prompt=prompt)
        return {"summary": "把镂空Usagi文字移到该面中心", "instruction": "在盒子侧面中间镂空文字Usagi，其他部分保持不变", "changes": ["文字居中"]}
    monkeypatch.setattr(understanding.CloudJSONClient, "complete", complete)
    settings = SimpleNamespace(values=lambda: {"cloud_enabled": True})
    proposal = {"instruction": "在盒子侧面镂空文字Usagi", "revision": "rev1", "targetPartId": "outer_box"}
    history, pending = stored_context([
        {"sender": "user", "content": "添加镂空文字Usagi"},
        {"sender": "assistant", "proposal": proposal},
    ], "rev1")
    result = understanding.suggest_adjustment("这一面位置正中间", {"prompt": "盒子"}, settings, history=history, pending=pending)
    assert "Usagi" in seen["prompt"] and "这一面位置正中间" in seen["prompt"]
    assert "pending_adjustment" in seen["prompt"] and "未应用" in seen["prompt"]
    assert "完整修改指令" in seen["system"] and "Usagi" in result["instruction"]
    assert stored_context([{"sender": "assistant", "proposal": proposal}], "another-revision")[1] is None


def test_limited_review_is_not_a_visual_rejection():
    with pytest.raises(DomainError) as error:
        require_adjustment_acceptance({"status": "draft_retained", "message": "HTTP 429", "evidence": [{"error_code": "AI_HTTP_ERROR"}]})
    assert error.value.code == "AI_ADJUSTMENT_REVIEW_UNAVAILABLE"
    with pytest.raises(DomainError) as rejected:
        require_adjustment_acceptance({"status": "draft_retained", "message": "文字位置不正确", "evidence": [{"accepted": False}]})
    assert rejected.value.code == "AI_ADJUSTMENT_REVIEW"
    require_adjustment_acceptance({"status": "accepted"})
