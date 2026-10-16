"""家长主动发起的模型发现与最小文本连通测试，不修改当前生效模型。"""

import json
import time
from urllib.parse import urlsplit, urlunsplit
import httpx
from .transport import model_connection
from ..contracts import DomainError


def service_url(value):
    parsed = urlsplit(str(value).strip())
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise DomainError("请输入有效的 HTTPS 服务地址，不要在地址中携带密钥。", "AI_CONFIG")
    path = parsed.path.rstrip("/")
    for suffix in ("/chat/completions", "/messages", "/models"):
        if path.endswith(suffix):
            path = path[:-len(suffix)]
            break
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def connection_settings(settings, params):
    url = service_url(params.get("url", ""))
    protocol = params.get("protocol", "chat")
    if protocol not in ("chat", "messages"):
        raise DomainError("请选择支持的模型协议。", "AI_CONFIG")
    key = str(params.get("api_key") or "").strip()
    model_id = params.get("saved_id")
    if not key and model_id:
        saved = next((item for item in settings.get_models() if item["id"] == model_id), None)
        if not saved or service_url(saved["url"]) != url or saved["protocol"] != protocol:
            raise DomainError("服务地址或协议已更改，请重新输入 API Key。", "AI_CONFIG")
        key = settings.key_for_model(model_id)
    if not key or len(key) > 8192 or "\n" in key or "\r" in key:
        raise DomainError("请输入 API Key，或为候选模型保存密钥。", "AI_REQUIRED")
    headers = {"Authorization": "Bearer " + key} if protocol == "chat" else {
        "x-api-key": key, "anthropic-version": "2023-06-01",
    }
    return url, protocol, headers


def request_json(url, headers, body=None):
    try:
        with model_connection(url, httpx.Timeout(25, connect=10)) as client:
            with client.stream("GET" if body is None else "POST", url, headers=headers, json=body) as response:
                status = response.status_code
                if status >= 300:
                    reason = {400: "服务不接受此请求，请核对模型、协议与图片输入支持", 401: "密钥无效", 403: "没有访问权限，当前密钥套餐可能不包含该模型", 404: "服务未提供此接口或模型不存在", 422: "模型不支持此输入格式或参数", 429: "额度不足或请求过于频繁"}.get(status, "服务暂时不可用")
                    raise DomainError(f"{reason}（HTTP {status}）。", "AI_PROBE_HTTP")
                content = bytearray()
                for chunk in response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > 1024 * 1024:
                        raise DomainError("服务响应过大，请手动填写模型标识。", "AI_PROBE_RESPONSE")
                return json.loads(content)
    except DomainError:
        raise
    except httpx.TimeoutException:
        raise DomainError("连接超时，请检查地址与网络后重试。", "AI_PROBE_TIMEOUT") from None
    except httpx.RequestError:
        raise DomainError("连接失败，请检查网络、代理与服务地址。", "AI_PROBE_NETWORK") from None
    except (ValueError, TypeError):
        raise DomainError("服务没有返回有效的 JSON 数据。", "AI_PROBE_RESPONSE") from None


def discover_models(settings, params):
    url, _, headers = connection_settings(settings, params)
    result = request_json(url + "/models", headers)
    items = result.get("data") if isinstance(result, dict) else None
    if not isinstance(items, list):
        raise DomainError("此服务没有返回标准模型列表，可手动填写模型标识。", "AI_PROBE_RESPONSE")
    models = {}
    for item in items[:1000]:
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item["id"].strip():
            identifier = item["id"].strip()[:200]
            models[identifier] = {"id": identifier, "name": str(item.get("display_name") or item.get("name") or identifier)[:200]}
    return {"models": sorted(models.values(), key=lambda item: item["id"]), "url": url,
            "message": "发现列表不能证明模型可用于对话，请加入候选后测试。" if models else "服务未返回模型，可手动填写模型标识。",
            "has_more": bool(result.get("has_more")) or len(items) > 1000}


def test_model(settings, params):
    url, protocol, headers = connection_settings(settings, params)
    model = str(params.get("model") or "").strip()
    if not model or len(model) > 200:
        raise DomainError("请填写模型标识。", "AI_CONFIG")
    kind = params.get("kind", "text")
    if kind not in ("text", "image"):
        raise DomainError("请选择文字或图片测试。", "AI_CONFIG")
    expected = None
    body = {"model": model, "messages": [{"role": "user", "content": "Reply with OK."}], "max_tokens": 64, "stream": False}
    if kind == "image":
        from .image_probe import challenge
        from .client import PROTOCOLS
        image, prompt, expected = challenge()
        _, body = PROTOCOLS[protocol].request(model, "Answer the visual reading task accurately.", prompt, [image], "unused")
        body.update(max_tokens=256, stream=False)
    started = time.monotonic()
    result = request_json(url + ("/messages" if protocol == "messages" else "/chat/completions"), headers, body)
    try:
        text = ("".join(item["text"] for item in result["content"] if item.get("type") == "text")
                if protocol == "messages" else result["choices"][0]["message"]["content"])
        if not isinstance(text, str) or not text.strip():
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError):
        raise DomainError("接口已响应，但没有返回有效文本；请核对模型标识、协议或输出限制。", "AI_PROBE_RESPONSE") from None
    if expected is not None:
        from .image_probe import matches
        if not matches(text, expected):
            raise DomainError("接口已响应，但未正确识别随机测试图的数字、形状与颜色，暂不能确认图片能力。", "AI_PROBE_VISION")
    return {"available": True, "kind": kind, "supports_images": kind == "image",
            "latency_ms": round((time.monotonic() - started) * 1000),
            "message": "图片识别通过：正确读出随机数字、形状与颜色。此测试不代表照片建模质量。" if kind == "image" else "文本调用成功；图片能力可单独测试。"}
