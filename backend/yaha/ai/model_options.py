"""候选模型的可配置输出与等待参数；界面、注册表与调用使用同一校验。"""
from ..contracts import DomainError


def model_options(item, preset=None):
    source = (preset or {}) | item
    tokens = source.get("max_tokens", 8192)
    timeout = source.get("timeout_seconds", 300)
    effort = source.get("reasoning_effort") or None
    context = source.get("context_window_tokens", 0)
    inputs = source.get("max_input_tokens", 0)
    if type(tokens) is not int or not 256 <= tokens <= 1048576:
        raise DomainError("最大输出 Token 应为 256 至 1048576 的整数，请按服务支持的范围设置。", "AI_CONFIG")
    if type(timeout) is not int or not 30 <= timeout <= 1800:
        raise DomainError("模型等待时间应为 30 至 1800 秒的整数。", "AI_CONFIG")
    if effort not in (None, "low", "medium", "high", "max"):
        raise DomainError("请选择有效的思考强度。", "AI_CONFIG")
    if any(type(value) is not int or not 0 <= value <= 16777216 for value in (context, inputs)):
        raise DomainError("上下文窗口和输入 Token 上限应为 0 至 16777216 的整数，0 表示自动/未知。", "AI_CONFIG")
    if context and tokens >= context:
        raise DomainError("上下文窗口必须大于最大输出 Token，需为输入保留空间。", "AI_CONFIG")
    if context and inputs > context - tokens:
        raise DomainError("输入上限与预留输出之和超过上下文窗口，请降低上限或将输入设为 0 自动分配。", "AI_CONFIG")
    return {"max_tokens": tokens, "timeout_seconds": timeout, "reasoning_effort": effort, "context_window_tokens": context, "max_input_tokens": inputs}
