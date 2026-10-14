"""有界 SSE 接收；只拼接最终文本，不保存模型思考内容。"""

import json
from ..contracts import DomainError

MAX_TEXT = 128 * 1024


def events(response):
    lines, size = [], 0
    for line in response.iter_lines():
        if line.startswith("data:"):
            data = line[5:].lstrip()
            size += len(data)
            if size > 2 * 1024 * 1024:
                raise DomainError("模型响应超出接收预算。", "AI_RESPONSE_LIMIT")
            lines.append(data)
        elif not line and lines:
            data, lines = "\n".join(lines), []
            if data == "[DONE]":
                return
            yield json.loads(data)
    if lines:
        yield json.loads("\n".join(lines))


class Decoder:
    def __init__(self):
        self.parts = []
        self.text_chars = 0
        self.received_chars = 0
        self.complete = False
        self.stop_reason = None
        self.phase = "waiting"
        self.usage = {}

    def append(self, text):
        if text:
            self.phase = "content"
            self.text_chars += len(text)
            if self.text_chars > MAX_TEXT:
                raise DomainError("模型方案超过文本预算。", "AI_RESPONSE_LIMIT")
            self.parts.append(text)

    def result(self):
        if self.stop_reason in ("length", "max_tokens"):
            raise DomainError("模型输出达到 token 上限，方案不完整。请增加模型输出预算或简化需求。", "AI_OUTPUT_LIMIT")
        if not self.complete or not self.parts:
            raise DomainError("模型连接结束，但没有返回完整方案。", "AI_RESPONSE")
        return "".join(self.parts)

    def consume(self, event):
        if event.get("type") == "error" or event.get("error"):
            raise DomainError("模型流返回错误，未返回完整方案。", "AI_STREAM")
        self.received_chars += len(json.dumps(event, ensure_ascii=False))
        self.update(event)


class ChatDecoder(Decoder):
    def update(self, event):
        self.usage.update(event.get("usage") or {})
        for choice in event.get("choices", []):
            delta = choice.get("delta", {})
            if delta.get("reasoning_content"):
                self.phase = "thinking"
            self.append(delta.get("content"))
            if choice.get("finish_reason"):
                self.stop_reason = choice["finish_reason"]
                self.complete = True


class MessagesDecoder(Decoder):
    def update(self, event):
        kind = event.get("type")
        if kind == "message_start":
            self.usage.update(event.get("message", {}).get("usage", {}))
        elif kind == "content_block_start":
            block = event.get("content_block", {})
            if block.get("type") == "text":
                self.append(block.get("text"))
        elif kind == "content_block_delta":
            delta = event.get("delta", {})
            if delta.get("type") == "thinking_delta":
                self.phase = "thinking"
            elif delta.get("type") == "text_delta":
                self.append(delta.get("text"))
        elif kind == "message_delta":
            self.stop_reason = event.get("delta", {}).get("stop_reason")
            self.usage.update(event.get("usage") or event.get("delta", {}).get("usage") or {})
        elif kind == "message_stop":
            self.complete = True
