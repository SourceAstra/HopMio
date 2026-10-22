import json
from types import SimpleNamespace
import pytest
from yaha.ai import conversation
from yaha.contracts import DesignSpec, DomainError


def run(monkeypatch, reply, text='把Usagi文字放在这一面正中间', editable=True, images=False, **kwargs):
    seen = {}
    def complete(self, system, prompt, attached):
        seen.update(system=system, context=json.loads(prompt), images=attached)
        return reply
    monkeypatch.setattr(conversation.CloudJSONClient, 'complete', complete)
    settings = SimpleNamespace(values=lambda: {'cloud_enabled': True}, public=lambda: {'chat_supports_images': images})
    spec = DesignSpec().model_dump() | ({'provider': 'parametric', 'modeling_plan': {'parameters': {}, 'steps': []}} if editable else {})
    result = conversation.converse(text, spec, settings, SimpleNamespace(data_uri=lambda _: 'data:image/png;base64,test'), history=[{'role': 'user', 'content': '侧面添加镂空Usagi'}], **kwargs)
    return result, seen


def test_text_only_model_discusses_edits_in_the_same_session(monkeypatch):
    result, seen = run(monkeypatch, {'action': 'adjust', 'summary': '镂空文字居中', 'instruction': '将镂空Usagi放在侧面中央', 'changes': ['保留镂空Usagi', '居中'], 'scope': 'selected'}, pending={'instruction': '镂空Usagi'}, selection={'selectedPartId': 'box'})
    assert result['action'] == 'adjust'
    assert seen['context']['pending_proposal']['instruction'] == '镂空Usagi'
    assert seen['context']['conversation_history'][0]['content'] == '侧面添加镂空Usagi'
    assert seen['images'] == []


def test_explicit_redesign_returns_design_without_old_geometry(monkeypatch):
    result, _ = run(monkeypatch, {'action': 'create', 'summary': '重新做钥匙扣', 'design': {'prompt': '写着Usagi的圆润钥匙扣', 'template': 'plaque', 'height_mm': 45, 'width_mm': 30, 'depth_mm': 4, 'hole': True}}, text='重新做成一个钥匙扣')
    assert result['design']['modeling_plan'] is None
    assert result['design']['hole'] and result['design']['provider'] == 'parametric'


def test_ambiguous_or_question_reply_does_not_issue_geometry(monkeypatch):
    result, _ = run(monkeypatch, {'action': 'ask', 'summary': '你想放大文字还是整个盒子？'}, text='放大一点')
    assert result['action'] == 'ask' and not result.get('instruction')


def test_invalid_edit_and_unsupported_screenshot_are_explicit(monkeypatch):
    with pytest.raises(DomainError) as error:
        run(monkeypatch, {'action': 'adjust', 'summary': '调整'}, editable=False)
    assert error.value.code == 'AI_ADJUSTMENT_REQUIRES_PLAN'
    with pytest.raises(DomainError) as error:
        run(monkeypatch, {}, location_asset_id='test')
    assert error.value.code == 'AI_CAPABILITY'
