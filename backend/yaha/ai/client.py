"""JSON 模型调用边界；协议策略负责请求和响应转换。"""

import json
import time
from typing import Protocol
from urllib.parse import urlsplit
import httpx
from .streaming import ChatDecoder, MessagesDecoder, events
from .transport import model_connection
from ..contracts import DomainError


class JSONModelClient(Protocol):
    def complete(self, instruction: str, prompt: str, images: list[str], observer=None, *, deadline=None) -> dict: ...


class ChatProtocol:
    suffix = "/chat/completions"
    decoder = ChatDecoder

    def effort(self, value):
        return {"reasoning_effort": value} if value else {}

    def request(self, model, instruction, prompt, images, key):
        content = ([{"type": "text", "text": prompt}] + [{"type": "image_url", "image_url": {"url": image}} for image in images]) if images else prompt
        return {"Authorization": "Bearer " + key}, {
            "model": model,
            "messages": [{"role": "system", "content": instruction}, {"role": "user", "content": content}],
            "response_format": {"type": "json_object"},
        }

    def text(self, result):
        if result["choices"][0].get("finish_reason") == "length":
            raise ValueError("输出被截断")
        return result["choices"][0]["message"]["content"]


class MessagesProtocol:
    suffix = "/messages"
    decoder = MessagesDecoder

    def effort(self, value):
        return {"output_config": {"effort": value}} if value else {}

    def request(self, model, instruction, prompt, images, key):
        content = [{"type": "text", "text": prompt}]
        for image in images:
            header, encoded = image.split(",", 1)
            content.append({"type": "image", "source": {"type": "base64", "media_type": header[5:].split(";")[0], "data": encoded}})
        return {"x-api-key": key, "anthropic-version": "2023-06-01"}, {
            "model": model, "system": instruction, "max_tokens": 8192,
            "messages": [{"role": "user", "content": content}],
        }

    def text(self, result):
        if result.get("stop_reason") == "max_tokens":
            raise ValueError("输出被截断")
        return "".join(block["text"] for block in result["content"] if block.get("type") == "text")


PROTOCOLS = {"chat": ChatProtocol(), "messages": MessagesProtocol()}


class CloudJSONClient:
    def __init__(self, settings):
        self.settings = settings

    def complete(self, instruction, prompt, images, observer=None, *, deadline=None):
        prefs = self.settings.values()
        if images and not self.settings.public()["chat_supports_images"]:
            raise DomainError("当前模型未配置图片输入能力，请使用文字描述或选择支持图片的模型。", "AI_CAPABILITY")
        url = prefs["chat_url"].rstrip("/")
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment or not prefs["chat_model"]:
            raise DomainError("请配置有效的 HTTPS 模型地址和名称。", "AI_CONFIG")
        protocol = PROTOCOLS.get(prefs["chat_protocol"])
        if protocol is None:
            raise DomainError("模型协议暂不支持。", "AI_CONFIG")
        if not url.endswith(protocol.suffix):
            url += protocol.suffix
        headers, body = protocol.request(prefs["chat_model"], instruction, prompt, images, self.settings.key("chat"))
        limits = self.settings.imported_model or {}
        seconds = limits.get("timeout_seconds", 300)
        if deadline is not None:
            seconds = min(seconds, deadline - time.monotonic())
            if seconds <= 0:
                raise DomainError("照片审阅超过整体时间预算，停止自动修订。", "PHOTO_REVIEW_TIMEOUT")
        body.update(stream=True, max_tokens=limits.get("max_tokens", 8192))
        body.update(protocol.effort(limits.get("reasoning_effort")))
        started, last = time.monotonic(), 0
        decoder = protocol.decoder()

        def report(phase=None, **extra):
            if observer:
                observer({"phase": phase or decoder.phase, "elapsed_seconds": round(time.monotonic() - started), "received_chars": decoder.received_chars, "text_chars": decoder.text_chars, "usage": dict(decoder.usage), **extra})

        try:
            report("connecting")
            timeout = httpx.Timeout(seconds, connect=min(15, seconds), write=min(30, seconds), pool=min(15, seconds))
            with model_connection(url, timeout) as client:
                self.settings.reserve_cloud("chat")
                with client.stream("POST", url, headers=headers, json=body) as response:
                    report("waiting", http_status=response.status_code)
                    if response.status_code >= 400:
                        raise DomainError(f"模型请求失败（HTTP {response.status_code}），请检查模型权限、密钥和额度。", "AI_HTTP_ERROR")
                    if "text/event-stream" in response.headers.get("content-type", ""):
                        for event in events(response):
                            if time.monotonic() - started > seconds:
                                raise DomainError("模型方案超过配置的等待时间，已停止接收。", "AI_TIMEOUT")
                            decoder.consume(event)
                            if time.monotonic() - last >= 1:
                                report()
                                last = time.monotonic()
                        report()
                        text = decoder.result().strip()
                    else:
                        content = bytearray()
                        for chunk in response.iter_bytes():
                            if time.monotonic() - started > seconds:
                                raise DomainError("模型方案超过配置的等待时间，已停止接收。", "AI_TIMEOUT")
                            content.extend(chunk)
                            if len(content) > 2 * 1024 * 1024:
                                raise DomainError("模型响应超出接收预算。", "AI_RESPONSE_LIMIT")
                        text = protocol.text(json.loads(content)).strip()
            if text.startswith("```") and text.endswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
            if not isinstance(result, dict):
                raise ValueError("需要 JSON 对象")
            report("complete")
            return result
        except DomainError as error:
            report("failed", error_code=error.code, error_type=type(error.__cause__).__name__ if error.__cause__ else type(error).__name__)
            raise
        except httpx.TimeoutException as error:
            report("failed", error_type=type(error).__name__)
            raise DomainError(f"模型请求超时（{type(error).__name__}，已等待 {round(time.monotonic() - started)} 秒），没有自动重试。", "AI_TIMEOUT") from None
        except httpx.RequestError:
            report("failed", error_type="RequestError")
            raise DomainError("模型连接失败或超时，没有自动重试，请检查网络和服务记录。", "AI_NETWORK") from None
        except (ValueError, TypeError, KeyError, IndexError) as error:
            report("failed", error_type=type(error).__name__)
            raise DomainError(f"模型响应格式无效（{type(error).__name__}），没有取得完整 JSON。", "AI_RESPONSE") from None
