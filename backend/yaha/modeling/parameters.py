"""当前版本的参数接口：仅接受数值补丁，执行链不调用 AI。"""

from typing import Annotated, Literal
from time import monotonic
from pydantic import AliasChoices, Field, StrictBool
from .contracts import Contract, Identifier
from .compiler import compile_plan
from .mesh_editing import editable_spec
from .planner import current_plan
from .building import build_model
from .geometry_review import review_geometry
from ..contracts import DesignSpec, DomainError


class ParameterTarget(Contract):
    schema_version: Literal[1]
    id: str = Field(min_length=1)
    base_revision_id: str = Field(min_length=1)


class ParameterPatch(ParameterTarget):
    parameters: dict[Identifier, StrictBool | Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-2000, le=2000)]] = Field(min_length=1, max_length=48, validation_alias=AliasChoices("parameters", "master_parameters"))


def parameter_source(service, request):
    project = service.projects.get(request.id)
    if project["revision_id"] != request.base_revision_id:
        raise DomainError("作品版本已改变，请重新打开参数微调。", "REVISION_CHANGED")
    if not project.get("model"):
        raise DomainError("先生成作品，再调整当前模型的参数。", "MODEL_REQUIRED")
    spec = editable_spec(DesignSpec.model_validate(project["spec"]), project, service.assets)
    if spec.modeling_plan.schema_version < 8:
        # 历史计划没有 UI 安全域；保留实际网格，仅开放有明确契约的整体缩放。
        spec = editable_spec(spec.model_copy(update={"modeling_plan": None}), project, service.assets)
    if not current_plan(spec):
        raise DomainError("当前版本的参数方案已失效，请先确认作品方案。", "PLAN_STALE")
    if spec.modeling_plan.generator:
        from .generators import canonical_parameters
        spec.modeling_plan.parameters = canonical_parameters(spec.modeling_plan)
    return spec


def describe_parameters(service, data):
    request = ParameterTarget.model_validate(data)
    spec = parameter_source(service, request)
    return request.model_dump() | {"parameters": {
        key: {"value": parameter.value, "unit": parameter.unit, **parameter.ui.model_dump()}
        for key, parameter in spec.modeling_plan.parameters.items() if parameter.ui
    }}


def build_direct(service, spec, project, job):
    started = monotonic()
    result = build_model(service, spec, job, fit_photos=False, review_views=bool(spec.modeling_plan.generator))
    topology = result[0].manifest.get("topology", {})
    if topology.get("boundary_edges") != 0 or topology.get("nonmanifold_edges") != 0:
        raise DomainError("实际网格存在开口或非流形边，参数未应用，原版本保留。", "BLENDER_GEOMETRY")
    spec, result = review_geometry(service, spec, result, project, job, require_change=True)
    result[0].manifest["execution"] = {"mode": "direct", "ai_used": False}
    result[0].manifest["origin"] = "参数微调 · Blender"
    if spec.modeling_plan.generator:
        result[0].manifest["origin"] = spec.modeling_plan.title + " · 本地生成器"
        result[0].manifest["execution"]["generator"] = spec.modeling_plan.generator.model_dump()
    job.record(parameter_recompute={"elapsed_ms": round((monotonic() - started) * 1000), "ai_used": False, "topology": topology})
    return spec, result


def apply_parameters(service, data):
    from ..generation import start_generation
    request = ParameterPatch.model_validate(data)
    spec = parameter_source(service, request)
    plan = spec.modeling_plan
    exposed = {key for key, parameter in plan.parameters.items() if parameter.ui}
    if request.parameters.keys() - exposed:
        raise DomainError("仅允许修改作品声明的用户主参数，内部参数和派生绑定不可写。", "PARAMETER_UNKNOWN")
    if all(plan.parameters[key].value == number for key, number in request.parameters.items()):
        raise DomainError("参数没有变化。", "PARAMETER_UNCHANGED")
    for key, number in request.parameters.items():
        if isinstance(number, bool) != isinstance(plan.parameters[key].value, bool):
            raise DomainError("参数类型不匹配；开关必须传布尔值。", "PARAMETER_TYPE")
        plan.parameters[key].value = number
    spec = DesignSpec.model_validate(spec.model_dump())
    plan = spec.modeling_plan
    compiled = compile_plan(plan)
    dimensions = {rule["feature"]: rule["expected_mm"] for rule in compiled["constraints"]}
    if compiled["surface"]:
        dimensions["model.height"] = compiled["surface"]["height_mm"]
    for axis in ("width", "depth", "height"):
        if "model." + axis in dimensions:
            setattr(spec, axis + "_mm", dimensions["model." + axis])
    spec = DesignSpec.model_validate(spec.model_dump())
    with service.lock:
        if service.projects.get(request.id)["revision_id"] != request.base_revision_id:
            raise DomainError("作品版本已改变，请重新打开参数微调。", "REVISION_CHANGED")
        return start_generation(service, request.id, spec.model_dump(), build_operation=build_direct, reason="参数微调")
