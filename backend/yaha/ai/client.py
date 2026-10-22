"""JSON 模型调用边界；协议策略负责请求和响应转换。"""

import json
import re
import time
from typing import Protocol
from urllib.parse import urlsplit
import httpx
from .streaming import ChatDecoder, MessagesDecoder, events
from .transport import model_connection
from .budgets import response_limits
from .input_budget import prepare_input
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
            raise DomainError("模型输出达到配置的 token 上限，方案不完整。请提高模型的 max_tokens 或调整需求后重试。", "AI_OUTPUT_LIMIT")
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
            raise DomainError("模型输出达到配置的 token 上限，方案不完整。请提高模型的 max_tokens 或调整需求后重试。", "AI_OUTPUT_LIMIT")
        return "".join(block["text"] for block in result["content"] if block.get("type") == "text")


PROTOCOLS = {"chat": ChatProtocol(), "messages": MessagesProtocol()}


def clean_and_repair_json(text: str) -> str:
    in_string = False
    escape = False
    stack = []
    out = []
    i = 0
    n = len(text)
    while i < n:
        char = text[i]
        if escape:
            escape = False
            out.append(char)
            i += 1
            continue
        if char == "\\":
            if in_string:
                escape = True
            out.append(char)
            i += 1
            continue
        if in_string:
            if char == "\"":
                in_string = False
            out.append(char)
            i += 1
            continue
        if char == "\"":
            if stack and stack[-1] == "[":
                if re.match(r'^\"[a-zA-Z0-9_]+\"\s*:', text[i:]):
                    out.append("{")
                    stack.append("{_implicit}")
            in_string = True
            out.append(char)
            i += 1
            continue
        if char == "{":
            stack.append("{")
            out.append(char)
            i += 1
            continue
        if char == "}":
            if stack and stack[-1] == "{_implicit}":
                out.append("}")
                stack.pop()
            if stack and stack[-1] == "{":
                stack.pop()
            out.append(char)
            i += 1
            continue
        if char == "[":
            stack.append("[")
            out.append(char)
            i += 1
            continue
        if char == "]":
            if stack and stack[-1] == "{_implicit}":
                out.append("}")
                stack.pop()
            if stack and stack[-1] == "[":
                stack.pop()
            out.append(char)
            i += 1
            continue
        if char == ",":
            if stack and stack[-1] == "{_implicit}":
                out.append("}")
                stack.pop()
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in "}]":
                i = j
                continue
            out.append(char)
            i += 1
            continue
        out.append(char)
        i += 1
    while stack and stack[-1] == "{_implicit}":
        out.append("}")
        stack.pop()
    return "".join(out)


def close_truncated_json(s: str) -> str:
    """健壮闭合任意截断的 JSON 文本，确保输出严格合法的 JSON 对象。"""
    s = s.strip()
    start = s.find("{")
    if start == -1:
        return "{}"
    s = s[start:]

    # 尝试逐步回退末尾残片，找到合法的闭合点
    for _ in range(500):
        in_string = False
        escape = False
        for c in s:
            if escape:
                escape = False
                continue
            if c == "\\":
                if in_string:
                    escape = True
                continue
            if c == '"':
                in_string = not in_string
                continue
        
        candidate = s
        if in_string:
            candidate += '"'
        
        # 彻底剪除悬空或未完成的键值结构
        candidate = re.sub(r'([,{]\s*)"[^"]*"\s*:\s*$', r'\1', candidate)
        candidate = re.sub(r':\s*$', '', candidate)
        candidate = re.sub(r'([,{]\s*)"[^"]*"\s*$', r'\1', candidate)
        candidate = re.sub(r'[,:\s]+$', '', candidate)

        instack = []
        in_str = False
        esc = False
        for c in candidate:
            if esc:
                esc = False
                continue
            if c == "\\":
                if in_str:
                    esc = True
                continue
            if c == '"':
                in_str = not in_str
                continue
            if not in_str:
                if c in "{[":
                    instack.append(c)
                elif c == "}" and instack and instack[-1] == "{":
                    instack.pop()
                elif c == "]" and instack and instack[-1] == "[":
                    instack.pop()
        
        if not in_str:
            closing = ["}" if op == "{" else "]" for op in reversed(instack)]
            final_text = candidate + "".join(closing)
            try:
                res = json.loads(final_text)
                if isinstance(res, dict):
                    return final_text
            except json.JSONDecodeError:
                pass
        
        s = s[:-1].rstrip()
        if not s:
            break
            
    return "{}"


def extract_json_object(text: str) -> dict:
    text = text.strip()
    if "<think>" in text and "</think>" in text:
        text = text.split("</think>", 1)[1].strip()
    if "```" in text:
        parts = text.split("```")
        for i in range(1, len(parts), 2):
            block = parts[i]
            if block.startswith("json"):
                block = block[4:]
            block = block.strip()
            if "{" in block:
                text = block
                break
    start = text.find("{")
    if start == -1:
        raise ValueError("未找到有效 JSON 对象")
    decoder = json.JSONDecoder()
    try:
        obj, _ = decoder.raw_decode(text[start:])
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    end = text.rfind("}")
    if end != -1 and end > start:
        try:
            obj = json.loads(text[start : end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    repaired = clean_and_repair_json(text[start:])
    try:
        obj, _ = decoder.raw_decode(repaired)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    end = repaired.rfind("}")
    if end != -1:
        try:
            obj = json.loads(repaired[: end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    closed = close_truncated_json(repaired)
    try:
        obj = json.loads(closed)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    closed_raw = close_truncated_json(text)
    try:
        obj = json.loads(closed_raw)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    if len(text) > 1500 and not text.rstrip().endswith("}"):
        raise DomainError("模型方案因长度超出单次生成预算在传输中被截断，未能取得完整 JSON。已自动触发紧凑优化重试。", "AI_OUTPUT_LIMIT")
    obj = json.loads(text)
    if not isinstance(obj, dict):
        raise ValueError("需要 JSON 对象")
    return obj


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
        limits = getattr(self.settings, "imported_model", None) or {}
        prompt, input_diagnostics = prepare_input(instruction, prompt, limits, image_count=len(images))
        headers, body = protocol.request(prefs["chat_model"], instruction, prompt, images, self.settings.key("chat"))
        seconds = limits.get("timeout_seconds", 300)
        if deadline is not None:
            seconds = min(seconds, deadline - time.monotonic())
            if seconds <= 0:
                raise DomainError("照片审阅超过整体时间预算，停止自动修订。", "PHOTO_REVIEW_TIMEOUT")
        max_tokens = limits.get("max_tokens", 8192)
        receive = response_limits(max_tokens)
        body.update(stream=True, max_tokens=max_tokens)
        body.update(protocol.effort(limits.get("reasoning_effort")))
        started, last = time.monotonic(), 0
        decoder = protocol.decoder(max_text_chars=receive["max_text_chars"])
        text = ""

        def report(phase=None, **extra):
            if observer:
                observer({"phase": phase or decoder.phase, "elapsed_seconds": round(time.monotonic() - started), "received_chars": decoder.received_chars, "text_chars": decoder.text_chars, "usage": dict(decoder.usage), **input_diagnostics, **extra})

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
                        for event in events(response, max_wire_bytes=receive["max_wire_bytes"], max_event_bytes=receive["max_event_bytes"]):
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
                            if len(content) > receive["max_wire_bytes"]:
                                raise DomainError(f"AI 响应数据超过接收上限（{receive['max_wire_bytes'] // 1048576} MB），不是对话上下文超限。请检查服务响应或 config/ai.yaml。", "AI_RESPONSE_LIMIT")
                        text = protocol.text(json.loads(content)).strip()
                        decoder.append(text)
            result = extract_json_object(text)
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
            report("failed", error_type=type(error).__name__, response_excerpt=text[:2048])
            raise DomainError(f"模型响应格式无效（{type(error).__name__}），没有取得完整 JSON。", "AI_RESPONSE") from None
