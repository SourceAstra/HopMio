"""有界 SSE 接收；只拼接最终文本，不保存模型思考内容。"""

import json
from ..contracts import DomainError
from .budgets import response_limits

def events(response, *, max_wire_bytes=None, max_event_bytes=None):
    limits = response_limits(8192)
    max_wire_bytes = max_wire_bytes or limits["max_wire_bytes"]
    max_event_bytes = max_event_bytes or limits["max_event_bytes"]
    lines, size, event_size = [], 0, 0
    for line in response.iter_lines():
        received = len(line.encode("utf-8")) + 1
        size += received
        if size > max_wire_bytes:
            raise DomainError(f"AI 流式响应累计数据超过接收上限（{max_wire_bytes // 1048576} MB，含协议与思考数据），不是对话上下文超限。请检查服务响应或调整 config/ai.yaml。", "AI_RESPONSE_LIMIT")
        event_size += received
        if event_size > max_event_bytes:
            raise DomainError("AI 单个流式消息过大，请检查服务响应或调整 config/ai.yaml 中的单消息接收上限。", "AI_RESPONSE_LIMIT")
        if line.startswith("data:"):
            data = line[5:].lstrip()
            lines.append(data)
        elif not line:
            event_size = 0
            if lines:
                data, lines = "\n".join(lines), []
                if data == "[DONE]":
                    return
                yield json.loads(data)
    if lines:
        yield json.loads("\n".join(lines))


class Decoder:
    def __init__(self, *, max_text_chars=None):
        self.max_text_chars = max_text_chars or response_limits(8192)["max_text_chars"]
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
            if self.text_chars > self.max_text_chars:
                raise DomainError(f"AI 最终方案超过接收上限（{self.max_text_chars} 字符），不是对话上下文超限。请检查模型输出配置。", "AI_RESPONSE_LIMIT")
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
