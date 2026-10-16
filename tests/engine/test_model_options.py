import json
import httpx
import pytest
from yaha.storage.database import Database
from yaha.settings import Settings
from yaha.ai import client
from yaha.ai.model_options import model_options
from yaha.contracts import DomainError


def test_settings_without_pin_persist_budget_and_send_actual_request(tmp_path, monkeypatch):
    db = Database(tmp_path)
    settings = Settings(db)
    monkeypatch.setattr('yaha.settings.keyring.get_password', lambda *args: None)
    monkeypatch.setattr(Settings, 'key', lambda *args: 'isolated-test-key')
    item = {'id':'isolated-model', 'name':'测试', 'url':'https://model.test/v1', 'protocol':'chat', 'model':'model', 'supports_images':False, 'context_window_tokens':1048576, 'max_input_tokens':700000, 'max_tokens':262144, 'timeout_seconds':900, 'reasoning_effort':'low'}
    public = settings.update('', {'models':[item], 'active_model':item['id'], 'cloud_enabled':True})
    assert public['models'][0]['max_tokens'] == 262144
    assert not db.get('settings','guardian')
    assert 'isolated-test-key' not in str(public)
    db.close()
    db = Database(tmp_path); settings = Settings(db)
    assert settings.public()['models'][0]['timeout_seconds'] == 900
    assert settings.public()['models'][0]['max_input_tokens'] == 700000
    def response(request):
        body = json.loads(request.content)
        assert body['max_tokens'] == 262144 and body['reasoning_effort'] == 'low'
        return httpx.Response(200, json={'choices':[{'finish_reason':'stop','message':{'content':'{"ok":true}'}}]})
    def connect(url, timeout):
        assert timeout.read == 900
        return httpx.Client(transport=httpx.MockTransport(response))
    monkeypatch.setattr(client,'model_connection',connect)
    assert client.CloudJSONClient(settings).complete('test','test',[]) == {'ok':True}
    db.close()


@pytest.mark.parametrize('patch', [{'max_tokens':0}, {'max_tokens':True}, {'max_tokens':1.5}, {'max_tokens':1048577}, {'timeout_seconds':29}, {'timeout_seconds':1801}, {'reasoning_effort':'invalid'}])
def test_invalid_budgets_rejected(patch):
    with pytest.raises(DomainError):
        model_options(patch)
