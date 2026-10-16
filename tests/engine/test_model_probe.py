"""模型发现与连通测试：隔离远程服务与凭据库，不发送真实云端请求。"""
import json
from types import SimpleNamespace
import httpx
import pytest
from yaha.ai import model_probe as probe
from yaha.contracts import DomainError


def settings():
    def require(token):
        if token != "guardian":
            raise DomainError("需要解锁")
    return SimpleNamespace(require=require, get_models=lambda: [{"id": "saved", "url": "https://models.test/v1/messages", "protocol": "messages"}], key_for_model=lambda identifier: "saved-secret")


def mock(monkeypatch, handler):
    monkeypatch.setattr(probe, "model_connection", lambda url, timeout: httpx.Client(transport=httpx.MockTransport(handler), timeout=timeout))


@pytest.mark.parametrize("protocol,suffix,header", [("chat", "chat/completions", "authorization"), ("messages", "messages", "x-api-key")])
def test_discovery_and_text_probe(monkeypatch, protocol, suffix, header):
    seen = []
    def handler(request):
        seen.append(request)
        assert "secret" in request.headers[header]
        if request.method == "GET":
            assert request.url.path == "/v1/models"
            return httpx.Response(200, json={"data": [{"id": "demo"}, {"id": "demo"}, {"no_id": True}]})
        body = json.loads(request.content)
        assert body["model"] == "demo" and not body["stream"]
        assert request.url.path == "/v1/" + suffix
        return httpx.Response(200, json={"content": [{"type": "text", "text": "OK"}]} if protocol == "messages" else {"choices": [{"message": {"content": "OK"}}]})
    mock(monkeypatch, handler)
    params = {"token": "guardian", "url": "https://models.test/v1/" + suffix, "protocol": protocol, "api_key": "secret", "model": "demo"}
    assert probe.discover_models(settings(), params)["models"] == [{"id": "demo", "name": "demo"}]
    result = probe.test_model(settings(), params)
    assert result["available"] and "secret" not in str(result)
    assert len(seen) == 2


def test_saved_key_requires_original_service(monkeypatch):
    mock(monkeypatch, lambda request: httpx.Response(200, json={"data": []}))
    params = {"token": "guardian", "url": "https://models.test/v1", "protocol": "messages", "saved_id": "saved"}
    assert probe.discover_models(settings(), params)["models"] == []
    for patch in ({"url": "https://another.test/v1"}, {"protocol": "chat"}):
        with pytest.raises(DomainError):
            probe.discover_models(settings(), params | patch)


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500])
def test_errors_do_not_expose_remote_content(monkeypatch, status):
    mock(monkeypatch, lambda request: httpx.Response(status, text="secret-key-in-error"))
    with pytest.raises(DomainError) as error:
        probe.discover_models(settings(), {"token": "guardian", "url": "https://models.test/v1", "api_key": "secret"})
    assert str(status) in str(error.value) and "secret-key" not in str(error.value)


@pytest.mark.parametrize("url", ["http://models.test", "https://key@models.test", "https://models.test/?key=secret"])
def test_invalid_url_rejected(url):
    with pytest.raises(DomainError):
        probe.service_url(url)


def test_saved_model_endpoint_overrides_preset(monkeypatch):
    from yaha import settings as module
    monkeypatch.setattr(module, "load_model", lambda name=None: {"chat_url": "https://old.test/v1", "max_tokens": 4096})
    saved = {"active_model": "existing", "models": [{"id": "existing", "name": "Edited", "url": "https://new.test/v1", "protocol": "chat", "model": "new-model"}]}
    store = SimpleNamespace(get=lambda table, key: saved if key == "preferences" else None)
    result = module.Settings(store).imported_model
    assert result["chat_url"] == "https://new.test/v1"
    assert result["chat_model"] == "new-model" and result["max_tokens"] == 4096


@pytest.mark.parametrize("protocol", ["chat", "messages"])
def test_image_probe_checks_visual_answer(monkeypatch, protocol):
    from yaha.ai import image_probe
    image, prompt, expected = image_probe.challenge()
    assert expected["code"] not in prompt
    monkeypatch.setattr(image_probe, "challenge", lambda: (image, prompt, expected))
    def handler(request):
        body = json.loads(request.content)
        parts = body["messages"][-1]["content"]
        assert len(parts) == 2 and body["max_tokens"] == 256
        assert (parts[1]["image_url"]["url"].startswith("data:image/png;base64,") if protocol == "chat" else parts[1]["source"]["media_type"] == "image/png")
        text = json.dumps(expected)
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]} if protocol == "chat" else {"content": [{"type": "text", "text": text}]})
    mock(monkeypatch, handler)
    params = {"token": "guardian", "url": "https://models.test/v1", "protocol": protocol, "api_key": "secret", "model": "vision", "kind": "image"}
    assert probe.test_model(settings(), params)["supports_images"] is True
    mock(monkeypatch, lambda request: httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}], "content": [{"type": "text", "text": "OK"}]}))
    with pytest.raises(DomainError) as error:
        probe.test_model(settings(), params)
    assert error.value.code == "AI_PROBE_VISION"
