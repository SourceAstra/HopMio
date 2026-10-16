import json
import pytest
from yaha.ai.input_budget import prepare_input, input_limit
from yaha.ai.model_options import model_options
from yaha.storage.conversations import bounded_history
from yaha.contracts import DomainError


def test_256k_output_and_one_million_context_are_independent():
    options = model_options({'max_tokens':262144, 'context_window_tokens':1048576, 'max_input_tokens':0})
    assert input_limit(options) == 786432
    assert input_limit(model_options({})) is None
    assert input_limit(model_options({'max_input_tokens':20000})) == 20000
    with pytest.raises(DomainError):
        model_options({'max_tokens':262144,'context_window_tokens':262144})


def test_history_fits_model_budget_without_chopping_current_model_or_request():
    context = {'conversation_history':[{'role':'user','content':('旧要求' * 300)} for _ in range(10)], 'current_design':{'text':'Usagi','dimensions':[100,50,50]}, 'pending_proposal':{'instruction':'镂空文字Usagi'}, 'latest_user_message':'放在正中间'}
    prompt, info = prepare_input('system', json.dumps(context,ensure_ascii=False), {'max_input_tokens':2500})
    result = json.loads(prompt)
    assert 0 < info['history_omitted_messages'] < 10
    assert info['input_tokens_estimated'] <= 2500
    for key in ('current_design','pending_proposal','latest_user_message'):
        assert result[key] == context[key]


def test_input_essential_payload_is_rejected_before_truncation():
    with pytest.raises(DomainError) as error:
        prepare_input('system', '当前模型' * 2000, {'max_input_tokens':1000})
    assert error.value.code == 'AI_INPUT_LIMIT'


def test_long_model_configuration_does_not_keep_old_character_ceiling():
    history = [{'role':'user','content':'一' * 5000} for _ in range(100)]
    assert bounded_history(history) == history
    context = {'conversation_history':history,'current_design':'盒子','latest_user_message':'居中'}
    prompt = json.dumps(context,ensure_ascii=False)
    large, info = prepare_input('system',prompt,{'context_window_tokens':16777216,'max_tokens':262144})
    assert json.loads(large)['conversation_history'] == history and info['history_omitted_messages'] == 0
    assert info['input_count_method'] == 'local_text_estimate'
