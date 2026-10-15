"""当前 JSON 模型协议的隔离 HTTP 验证，不提交真实云端任务。"""

import json
from types import SimpleNamespace
import httpx
import pytest
import yaha.ai.client as module
from yaha.contracts import DomainError


@pytest.mark.parametrize('protocol',['chat','messages'])
def test_model_submission_image_contract_and_result(monkeypatch,protocol):
    requests,charges,observations=[],[],[]
    settings=SimpleNamespace(
        values=lambda:{'chat_url':'https://model.example.test/v1','chat_model':'test-model','chat_protocol':protocol},
        public=lambda:{'chat_supports_images':True},
        key=lambda provider:'test-only-key',
        reserve_cloud=charges.append,
        imported_model={'timeout_seconds':30,'max_tokens':256},
    )
    def handle(request):
        body=json.loads(request.content)
        requests.append((request,body))
        result='{"title":"可编辑结构件"}'
        envelope={'choices':[{'finish_reason':'stop','message':{'content':result}}]} if protocol=='chat' else {'stop_reason':'end_turn','content':[{'type':'text','text':result}]}
        return httpx.Response(200,json=envelope)
    transport=httpx.MockTransport(handle)
    monkeypatch.setattr(module,'model_connection',lambda url,timeout:httpx.Client(transport=transport,timeout=timeout))
    result=module.CloudJSONClient(settings).complete('只返回JSON','设计结构件',['data:image/png;base64,eA=='],observations.append)
    assert result=={'title':'可编辑结构件'}
    request,body=requests[0]
    assert body['model']=='test-model' and body['max_tokens']==256 and body['stream']
    assert charges==['chat']
    if protocol=='chat':
        assert request.url.path=='/v1/chat/completions'
        assert request.headers['authorization']=='Bearer test-only-key'
        assert body['messages'][1]['content'][1]['image_url']['url']=='data:image/png;base64,eA=='
    else:
        assert request.url.path=='/v1/messages'
        assert request.headers['x-api-key']=='test-only-key'
        assert body['messages'][0]['content'][1]['source']=={'type':'base64','media_type':'image/png','data':'eA=='}
    assert observations[-1]['phase']=='complete'
    assert 'test-only-key' not in str(observations)


def test_invalid_model_json_preserves_response_diagnostic(monkeypatch):
    observations=[]
    settings=SimpleNamespace(
        values=lambda:{'chat_url':'https://model.example.test/v1','chat_model':'test-model','chat_protocol':'chat'},
        public=lambda:{'chat_supports_images':True},key=lambda provider:'test-only-key',
        reserve_cloud=lambda provider:None,imported_model={},
    )
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':'incomplete-json'}}]}))
    monkeypatch.setattr(module,'model_connection',lambda url,timeout:httpx.Client(transport=transport,timeout=timeout))
    with pytest.raises(DomainError) as error:
        module.CloudJSONClient(settings).complete('JSON','test',[],observations.append)
    assert error.value.code=='AI_RESPONSE'
    assert observations[-1]['response_excerpt']=='incomplete-json'
