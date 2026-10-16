"""按模型管理输入；本地为文本估算，厂商 usage 才是精确计数。"""
import json
import math
import re
from ..contracts import DomainError


def estimate_tokens(text):
    count = 0
    for piece in re.findall(r'[A-Za-z]+|[0-9]+|\s+|.', text, re.S):
        if piece.isascii() and piece.isalnum():
            count += math.ceil(len(piece) / 3)
        elif piece.isspace():
            count += math.ceil(len(piece) / 4)
        else:
            count += max(1, math.ceil(len(piece.encode('utf-8')) / 2))
    return count


def input_limit(options):
    context, limit = options.get('context_window_tokens', 0), options.get('max_input_tokens', 0)
    if context:
        remaining = context - options.get('max_tokens', 8192)
        if remaining <= 0:
            raise DomainError('上下文窗口没有为输入预留空间，请调整模型预算。', 'AI_INPUT_LIMIT')
        return min(limit, remaining) if limit else remaining
    return limit or None


def prepare_input(system, prompt, options, *, image_count=0):
    limit = input_limit(options)
    omitted = 0
    try:
        context = json.loads(prompt)
    except (ValueError, TypeError):
        context = None
    # 只裁剪明确的历史区，系统要求、当前模型、最新指令和待确认方案绝不截断。
    history = context.get('conversation_history') if isinstance(context, dict) else None
    system_tokens = estimate_tokens(system)
    estimated = system_tokens + estimate_tokens(prompt) + 32
    if limit and isinstance(history, list) and estimated > limit:
        # 逐项扣除历史开销，避免每移除一条就重算整段长上下文。
        remaining = estimated + 64
        while history and remaining > limit:
            removed = history.pop(0)
            remaining -= estimate_tokens(json.dumps(removed, ensure_ascii=False)) + 1
            omitted += 1
        context['history_omitted_messages'] = omitted
        prompt = json.dumps(context, ensure_ascii=False)
        estimated = system_tokens + estimate_tokens(prompt) + 32
        while history and estimated > limit:
            history.pop(0); omitted += 1
            context['history_omitted_messages'] = omitted
            prompt = json.dumps(context, ensure_ascii=False)
            estimated = system_tokens + estimate_tokens(prompt) + 32
    if limit and estimated > limit:
        raise DomainError(f'当前作品与最新要求的文本输入估算约 {estimated} Token，超过输入预算 {limit}；未截断模型或发送请求。请在设置中提高输入/上下文预算，或减少本次材料。图片 Token 另由服务校验。', 'AI_INPUT_LIMIT')
    return prompt, {'input_tokens_estimated': estimated, 'input_token_limit': limit, 'history_omitted_messages': omitted, 'input_count_method': 'local_text_estimate', 'image_token_count': 'provider_only' if image_count else 0}
