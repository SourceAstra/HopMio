"""自然语言修改当前参数方案；请求与原始造物描述分别保留。"""

from .compiler import compile_plan, compiled_geometry
from .planner import apply_plan
from .references import reference_images
from ..contracts import DomainError


def adjust_plan(service, spec, adjustment, project, job):
    previous = spec.modeling_plan
    vision = service.settings.public()["chat_supports_images"]
    if adjustment.location_asset_id and not vision:
        raise DomainError("当前模型不支持图片输入，无法读取圈注截图；请在家长设置中选择支持视觉输入的模型。", "AI_CAPABILITY")
    images = reference_images(spec, service.assets) if vision else []
    location_image = service.assets.data_uri(adjustment.location_asset_id) if vision and adjustment.location_asset_id else None
    if location_image and adjustment.location_point:
        adjustment.instruction += f" 用户圈注截图中的标记中心位于图片宽高的 {adjustment.location_point[0]:.1f}%、{adjustment.location_point[1]:.1f}%。"
    comparison_id = (project.get("model") or {}).get("comparison_id")
    preview = service.assets.path(comparison_id).read_bytes() if vision and comparison_id else None
    job.progress(5, "AI 正在理解细节调整要求")

    def observe(value):
        job.check()
        phase = value.get("phase")
        elapsed = value.get("elapsed_seconds", 0)
        chars = value.get("text_chars", 0)
        stages = {
            "connecting": "AI 正在连接服务…",
            "waiting": "AI 正在分析微调要求与参考视图…",
            "thinking": f"AI 正在思考细节调整方案（思考 {elapsed}s）",
            "content": f"AI 正在生成几何调整步骤（已输出 {chars} 字）",
            "validating": "AI 正在验证微调几何方案…",
        }
        job.record(ai_diagnostics=value, message=stages.get(phase, "AI 正在理解细节调整要求"))

    plan = service.editor.adjust(spec, images, adjustment.instruction, preview, observe, location_image=location_image)
    before, after = compile_plan(previous), compile_plan(plan)
    if compiled_geometry(before) == compiled_geometry(after):
        raise DomainError("建模 AI 返回了与原方案相同的几何，调整未执行，原模型已保留。", "AI_ADJUSTMENT_UNCHANGED")
    changes = [f"{parameter.label}：{previous.parameters[name].value:g} → {parameter.value:g} {parameter.unit}" for name, parameter in plan.parameters.items() if name in previous.parameters and parameter.value != previous.parameters[name].value]
    old_parts = {step["id"]: step for step in before["steps"]}
    changed_parts = [step["name"] for step in after["steps"] if step != old_parts.get(step["id"])]
    new_ids = {step.id for step in plan.steps}
    changed_parts += [step.name for step in previous.steps if step.id not in new_ids]
    apply_plan(service, spec, plan, job)
    return adjustment.model_dump() | {"changes": changes, "parts": changed_parts}
