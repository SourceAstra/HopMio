import json
from types import SimpleNamespace
import httpx
import pytest
from yaha.ai import client
from yaha.ai.budgets import response_limits
from yaha.ai.streaming import ChatDecoder, MessagesDecoder, events
from yaha.contracts import DomainError


def test_large_reasoning_stream_does_not_use_final_text_budget():
    def lines():
        # 重现：尚未输出方案，思考流+重复元数据已超过旧的2MB。
        for i in range(14000):
            yield 'data: ' + json.dumps({'id': 'response-id-' * 10, 'choices': [{'delta': {'reasoning_content': 'x' * 60}}]})
            yield ''
        yield 'data: ' + json.dumps({'choices': [{'delta': {'content': '{"ok":true}'}, 'finish_reason': 'stop'}]})
        yield ''
        yield 'data: [DONE]'
        yield ''
    decoder = ChatDecoder()
    for event in events(SimpleNamespace(iter_lines=lines)):
        decoder.consume(event)
    assert json.loads(decoder.result()) == {'ok': True}
    assert decoder.received_chars > 2 * 1024 * 1024
    assert decoder.text_chars == len('{"ok":true}')
    assert not any('response-id' in part for part in decoder.parts)


def test_token_configuration_scales_text_and_wire_separately():
    low, high = response_limits(8192), response_limits(32768)
    assert high['max_wire_bytes'] > low['max_wire_bytes']
    decoder = ChatDecoder(max_text_chars=high['max_text_chars'])
    decoder.consume({'choices': [{'delta': {'content': 'a' * 200000}, 'finish_reason': 'stop'}]})
    assert len(decoder.result()) == 200000


def test_event_total_text_and_incomplete_output_remain_bounded():
    response = SimpleNamespace(iter_lines=lambda: iter(['data: ' + 'x' * 200, '']))
    with pytest.raises(DomainError, match='单个流式消息'):
        list(events(response, max_event_bytes=100))
    with pytest.raises(DomainError, match='累计数据'):
        list(events(response, max_wire_bytes=100))
    with pytest.raises(DomainError, match='最终方案'):
        ChatDecoder(max_text_chars=5).append('abcdef')
    decoder = MessagesDecoder()
    decoder.consume({'type': 'content_block_delta', 'delta': {'type': 'text_delta', 'text': '{'}})
    decoder.consume({'type': 'message_delta', 'delta': {'stop_reason': 'max_tokens'}})
    with pytest.raises(DomainError) as error:
        decoder.result()
    assert error.value.code == 'AI_OUTPUT_LIMIT'


def test_non_stream_response_uses_same_model_receive_configuration(monkeypatch):
    settings = SimpleNamespace(values=lambda: {'chat_url': 'https://example.test/v1', 'chat_model': 'test', 'chat_protocol': 'chat'}, key=lambda _: 'fake-test-key', reserve_cloud=lambda _: None, imported_model={'max_tokens': 32768})
    def handle(request):
        assert json.loads(request.content)['max_tokens'] == 32768
        return httpx.Response(200, json={'unused_metadata': 'a' * (3 * 1024 * 1024), 'choices': [{'message': {'content': '{"ok":true}'}, 'finish_reason': 'stop'}]})
    monkeypatch.setattr(client, 'model_connection', lambda url, timeout: httpx.Client(transport=httpx.MockTransport(handle)))
    assert client.CloudJSONClient(settings).complete('test', 'test', []) == {'ok': True}
