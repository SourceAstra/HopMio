"""项目脚本 v1；解析仅提取字面量，不在服务进程执行用户代码。"""

import ast
import math
import re
from typing import Literal
from pydantic import Field, StrictBool, model_validator
from .contracts import Contract, Identifier, Number
from .parameters import ParameterTarget
from ..contracts import DomainError


class ScriptDocument(Contract):
    schema_version: Literal[1] = 1
    source: str = Field(max_length=200_000)
    operation: Literal["replace", "edit"] = "replace"
    coordinate_unit: Literal["mm", "m"] = "mm"
    entrypoint: Literal["script", "build"] = "script"
    parameters: dict[Identifier, StrictBool | Number] = Field(default_factory=dict, max_length=48)
    expected_size_mm: tuple[float, float, float] | None = None

    @model_validator(mode="after")
    def dimensions(self):
        if self.expected_size_mm and any(not math.isfinite(v) or not 0.8 <= v <= 500 for v in self.expected_size_mm):
            raise ValueError("目标尺寸必须在 0.8～500 mm 之间")
        return self


class ScriptRequest(ParameterTarget):
    document: ScriptDocument


class ScriptAdoption(ParameterTarget):
    candidate_revision_id: str
    document: ScriptDocument


def declarations(document):
    try:
        tree = ast.parse(document.source, filename="script.py")
    except SyntaxError as error:
        raise DomainError(f"script.py 第 {error.lineno} 行：{error.msg}", "SCRIPT_SYNTAX") from None
    declared = {}
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        for target in targets:
            if isinstance(target, ast.Name) and target.id in ("PARAMETERS", "PARAMETER_UI"):
                try:
                    declared[target.id] = ast.literal_eval(node.value)
                except (ValueError, TypeError, SyntaxError):
                    raise DomainError(target.id + " 须声明为顶层字面量字典。", "SCRIPT_PARAMETERS") from None
    defaults, ui = declared.get("PARAMETERS", {}), declared.get("PARAMETER_UI", {})
    if not isinstance(defaults, dict) or not isinstance(ui, dict) or len(defaults) > 48:
        raise DomainError("脚本参数须为字典，最多 48 项。", "SCRIPT_PARAMETERS")
    if document.parameters.keys() - defaults.keys():
        raise DomainError("参数不在脚本的 PARAMETERS 声明中，请重新读取参数。", "SCRIPT_PARAMETERS")
    capabilities, values = {}, {}
    for key, default in defaults.items():
        if not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,47}", key) or type(default) not in (int, float, bool):
            raise DomainError("参数名须为 ASCII 标识符，参数值须为有限数值或布尔值。", "SCRIPT_PARAMETERS")
        value = document.parameters.get(key, default)
        meta = ui.get(key, {})
        if not isinstance(meta, dict):
            raise DomainError("PARAMETER_UI 的每项须为字典。", "SCRIPT_PARAMETERS")
        low, high, step = meta.get("min", -2000), meta.get("max", 2000), meta.get("step", 1 if type(default) is int else 0.1)
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in (low, high, step)) or not -2000 <= low <= high <= 2000 or step <= 0:
            raise DomainError("参数范围或步长无效。", "SCRIPT_PARAMETERS")
        if isinstance(value, bool) != isinstance(default, bool) or (not isinstance(value, bool) and (not math.isfinite(value) or not low <= value <= high)):
            raise DomainError(f"参数 {key} 类型或范围不符合声明。", "SCRIPT_PARAMETERS")
        if not isinstance(default, bool) and (not math.isfinite(default) or not low <= default <= high):
            raise DomainError(f"参数 {key} 默认值不符合声明。", "SCRIPT_PARAMETERS")
        unit = meta.get("unit", "ratio")
        if unit not in ("mm", "deg", "ratio"):
            raise DomainError("参数单位须为 mm、deg 或 ratio。", "SCRIPT_PARAMETERS")
        if type(default) is int and step % 1 == 0:
            if value % 1:
                raise DomainError(f"参数 {key} 须为整数。", "SCRIPT_PARAMETERS")
            value = int(value)
        values[key] = value
        capabilities[key] = {"value": value, "display_label": str(meta.get("label", key))[:60],
                             "unit": unit, "min": low, "max": high, "step": step}
    return values, capabilities
