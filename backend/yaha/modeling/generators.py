"""版本化本地生成器目录；参数数据进入受控 Blender，接口不接受脚本。"""

from dataclasses import dataclass
from .contracts import GeneratorReference, GeometryPlan, Parameter, PlanOptions
from .parameters import ParameterTarget, build_direct
from ..contracts import DesignSpec, DomainError, Mode


@dataclass(frozen=True)
class GeneratorDefinition:
    id: str
    version: int
    title: str
    description: str
    parameters: dict
    dimensions: dict


def slider(value, label, unit, low, high, step, description):
    return {"value": value, "label": label, "unit": unit, "ui": {"display_label": label, "control": "slider", "min": low, "max": high, "step": step, "description": description}}


REGISTRY = {
    ("sculpted_spinning_top", 1): GeneratorDefinition(
        "sculpted_spinning_top", 1, "流线陀螺",
        "一体式三叶连续曲面，顶部凹槽、底部旋转尖端；默认直径 60、高度 24 mm。照片仅作参考，外观需自行比对。",
        {
            "diameter_mm": slider(60, "整体直径", "mm", 40, 100, 2, "同时约束成品宽度与深度，保持圆形外缘。"),
            "height_mm": slider(24, "总高度", "mm", 16, 40, 1, "从旋转尖端到最高点，独立复测实际高度。"),
            "dimple_width": slider(1, "凹槽宽度", "ratio", 0.6, 1.4, 0.1, "相对默认凹槽半径的倍数，随整体直径同比变化。"),
            "dimple_depth": slider(1, "凹槽深度", "ratio", 0.5, 1.5, 0.1, "相对默认凹槽起伏的倍数，总高度保持不变。"),
            "blade_relief": slider(1, "叶片起伏", "ratio", 0, 1.5, 0.1, "改变三叶波峰与凹谷的强度，0 为无叶片起伏。"),
            "twist_deg": slider(75, "叶片扭转", "deg", 0, 120, 5, "从凹槽外侧到外缘的螺旋相位变化。"),
        },
        {"width": "diameter_mm", "depth": "diameter_mm", "height": "height_mm"},
    ),
}


def definition(reference):
    value = REGISTRY.get((reference.id, reference.version))
    if value is None:
        raise DomainError("该生成器或版本未安装，原作品保留。", "GENERATOR_UNKNOWN")
    return value


def canonical_parameters(plan):
    declared = definition(plan.generator).parameters
    if plan.parameters.keys() != declared.keys():
        raise DomainError("生成器参数与注册版本不一致。", "GENERATOR_PARAMETERS")
    # UI 范围与单位由注册版本决定，不能通过修改作品数据放宽。
    return {key: Parameter.model_validate(data | {"value": plan.parameters[key].value, "locked": plan.parameters[key].locked}) for key, data in declared.items()}


def compile_generator(plan):
    parameters = canonical_parameters(plan)
    values = {key: item.value for key, item in parameters.items()}
    constraints = [{"feature": "model." + axis, "expected_mm": values[key], "max_error_mm": 0.05}
                   for axis, key in definition(plan.generator).dimensions.items()]
    return {"schema_version": plan.schema_version, "generator": plan.generator.model_dump() | {"parameters": values},
            "steps": [], "constraints": constraints, "surface": None, "source_mesh": None, "reference_views": []}


def list_generators():
    return [{"id": item.id, "version": item.version, "title": item.title, "description": item.description}
            for item in REGISTRY.values()]


class GeneratorRequest(ParameterTarget):
    generator: GeneratorReference


def apply_generator(service, data):
    from ..generation import start_generation
    request = GeneratorRequest.model_validate(data)
    selected = definition(request.generator)
    with service.lock:
        project = service.projects.get(request.id)
        if project["revision_id"] != request.base_revision_id:
            raise DomainError("作品版本已改变，请重新选择生成器。", "REVISION_CHANGED")
        spec = DesignSpec.model_validate(project["spec"])
        spec.asset_ids = [identifier for identifier in spec.asset_ids
                          if (service.assets.db.get("assets", identifier) or {}).get("extension") in (".png", ".jpg", ".jpeg", ".webp")]
        # 显式采用生成器意味着新建该形体；不沿用旧模型的分件、孔与底座意图。
        spec.prompt = selected.title + "：" + selected.description
        spec.mode = Mode.MULTIVIEW if len(spec.asset_ids) > 1 else Mode.IMAGE if spec.asset_ids else Mode.TEXT
        spec.provider, spec.template, spec.photo_policy = "parametric", "custom", "parameters"
        spec.base, spec.hole, spec.reconstruction_plan = False, False, None
        for axis, key in selected.dimensions.items():
            setattr(spec, axis + "_mm", selected.parameters[key]["value"])
        plan = GeometryPlan(schema_version=9, generator=request.generator, title=selected.title,
                            source_prompt=spec.prompt, source_asset_ids=spec.asset_ids,
                            source_options=PlanOptions(base=False, hole=False, hole_shape=spec.hole_shape),
                            model_label="本地注册生成器 v" + str(selected.version), parameters=selected.parameters,
                            constraints=[{"feature": "model." + axis, "expected_mm": {"parameter": key}, "max_error_mm": 0.05} for axis, key in selected.dimensions.items()],
                            assumptions=[selected.description])
        spec.modeling_plan = plan
        spec.assumptions = list(plan.assumptions)
        spec = DesignSpec.model_validate(spec.model_dump())
        return start_generation(service, request.id, spec.model_dump(), build_operation=build_direct, reason="采用" + selected.title + "生成器")
