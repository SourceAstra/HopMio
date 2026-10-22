"""AI 只负责设计；校验后的计划由独立几何执行器完成。"""

from typing import Protocol
import base64
import json
from pydantic import ValidationError
from .contracts import GeometryPlan
from .compiler import compile_plan, compiled_geometry
from .prompts import render_prompts
from .references import reference_images
from .intent import validate_intent
from ..ai.client import JSONModelClient
from ..contracts import DesignSpec, DomainError


class ModelingPlanner(Protocol):
    def design(self, spec: DesignSpec, images: list[str], observer=None, *, correction=None, adjustment=None, deadline=None) -> GeometryPlan: ...


class ModelingReviewer(Protocol):
    def refine(self, spec: DesignSpec, images: list[str], preview: bytes, observer=None, *, feedback=None, adjustment=None, deadline=None) -> GeometryPlan: ...


class ModelingEditor(Protocol):
    def adjust(self, spec: DesignSpec, images: list[str], instruction: str, preview: bytes | None, observer=None, *, location_image: str | None = None) -> GeometryPlan: ...


class CloudModelingPlanner:
    def __init__(self, client: JSONModelClient):
        self.client = client

    def design(self, spec, images, observer=None, *, correction=None, adjustment=None, deadline=None):
        return self._design(spec, images, observer, correction=correction, adjustment=adjustment, deadline=deadline)

    def refine(self, spec, images, preview, observer=None, *, feedback=None, adjustment=None, deadline=None):
        reference = "data:image/png;base64," + base64.b64encode(preview).decode()
        return self._design(spec, images + [reference], observer, review=True, feedback=feedback, adjustment=adjustment, model_view_count=1, deadline=deadline)

    def adjust(self, spec, images, instruction, preview=None, observer=None, *, location_image=None):
        if location_image:
            images = [location_image] + images
        if preview:
            images = images + ["data:image/png;base64," + base64.b64encode(preview).decode()]
        return self._design(spec, images, observer, adjustment=instruction, model_view_count=int(bool(preview)), location_image_count=int(bool(location_image)))

    def _design(self, spec, images, observer=None, *, review=False, adjustment=None, model_view_count=0, location_image_count=0, feedback=None, deadline=None, correction=None):
        for attempt in range(2):
            instruction, prompt = render_prompts(spec, correction, review=review, adjustment=adjustment, model_view_count=model_view_count, location_image_count=location_image_count, reference_image_count=len(images) - model_view_count - location_image_count, feedback=feedback)
            try:
                data = self.client.complete(instruction, prompt, images, observer, **({"deadline": deadline} if deadline is not None else {}))
            except DomainError as error:
                if not attempt and error.code in ("AI_RESPONSE", "AI_OUTPUT_LIMIT"):
                    tight_hint = (
                        " 上次方案因输出超长在传输中被截断。本次生成请务必执行紧凑输出："
                        "1) 严禁深层公式嵌套，简单数值直接计算并填写常量；"
                        "2) 精简 geometry_bindings，仅保留最关键绑定；"
                        "3) 精简 assumptions，删除非必要说明；"
                        "4) 确保一次性输出完全闭合的合法 JSON，严禁截断！"
                        if error.code == "AI_OUTPUT_LIMIT" or "截断" in str(error) or "JSON" in str(error)
                        else " 请务必只输出严格合法的完整闭合 JSON 对象，符合 Schema 规范，严禁遗漏括号或输出截断。"
                    )
                    correction = {
                        "error": str(error) + tight_hint + (" 本次局部调整请求：" + adjustment if adjustment else ""),
                        "plan": json.dumps(spec.modeling_plan.model_dump(), ensure_ascii=False) if spec.modeling_plan else "{}",
                    }
                    continue
                raise
            if observer:
                observer({"phase": "validating", "plan_draft": data, "attempt": attempt + 1})
            try:
                if data.get("schema_version") != 8:
                    raise DomainError("新方案须使用 schema_version=8，声明可调主参数的 UI 安全域与几何绑定；旧版本仅用于读取历史作品。", "PLAN_COORDINATES")
                plan = GeometryPlan.model_validate(data)
                from .mesh_editing import require_source
                if spec.modeling_plan:
                    require_source(spec.modeling_plan, plan)
                if any(view.photo_index >= len(spec.asset_ids) for view in plan.reference_views):
                    raise DomainError("照片视角序号超出本次材料范围。", "AI_PLAN_INVALID")
                if spec.asset_ids and plan.surface and any(step.id == "base" for step in plan.steps):
                    raise DomainError("参考曲面的底座由执行器按用户选项添加；删除 id=base 的步骤，从主体开始，删除无用底座参数与推测。", "AI_PLAN_INVALID")
                if spec.modeling_plan:
                    references = json.dumps({"steps": [step.model_dump() for step in plan.steps], "surface": plan.surface.model_dump() if plan.surface else None, "source_mesh": plan.source_mesh.model_dump() if plan.source_mesh else None, "geometry_bindings": plan.model_dump()["geometry_bindings"]}, ensure_ascii=False)
                    for name, parameter in spec.modeling_plan.parameters.items():
                        if parameter.locked:
                            if name not in plan.parameters or json.dumps({"parameter": name})[1:-1] not in references:
                                raise DomainError("细化方案须继续引用已固定参数：" + name, "AI_PLAN_INVALID")
                            plan.parameters[name] = parameter.model_copy()
                if not plan.constraints:
                    raise DomainError("AI 方案缺少可复测尺寸。", "AI_PLAN_INVALID")
                compiled = compile_plan(plan)
                validate_intent(spec, plan, compiled, adjustment)
                if adjustment and spec.modeling_plan:
                    previous = compile_plan(spec.modeling_plan)
                    if compiled_geometry(compiled) == compiled_geometry(previous):
                        raise DomainError("建模 AI 返回了与原方案相同的几何，调整未执行，原模型已保留。必须修改实际几何步骤，不能只改说明。", "AI_ADJUSTMENT_UNCHANGED")
                compiled_steps = {step["id"]: step for step in compiled["steps"]}
                for step in plan.steps:
                    if step.shape == "loft" and step.id in compiled_steps:
                        step.size_mm = tuple(compiled_steps[step.id]["size_mm"])
                break
            except (ValidationError, DomainError) as error:
                message = str(error)
                if isinstance(error, ValidationError):
                    details = error.errors(include_input=False, include_url=False)
                    message = "AI 方案字段无效：" + "；".join(
                        ".".join(str(part) for part in detail["loc"]) + "（" + detail["msg"] + "）"
                        for detail in details[:8]
                    ) + (f"；另有{len(details) - 8}处错误" if len(details) > 8 else "") + "。"
                if attempt:
                    raise DomainError(message, error.code if isinstance(error, DomainError) and error.code == "AI_ADJUSTMENT_UNCHANGED" else "AI_PLAN_INVALID") from None
                correction = {"error": message + (" 本次局部调整请求：" + adjustment if adjustment else ""), "plan": json.dumps(data, ensure_ascii=False)}
        from .contracts import PlanOptions
        plan.source_options = PlanOptions(base=spec.base, hole=spec.hole, hole_shape=spec.hole_shape)
        plan.source_prompt = spec.prompt
        plan.source_asset_ids = list(spec.asset_ids)
        return plan


def current_plan(spec):
    plan = spec.modeling_plan
    options_match = not plan or plan.source_mesh or not plan.source_options or plan.source_options.model_dump() == {"base": spec.base, "hole": spec.hole, "hole_shape": spec.hole_shape}
    return bool(plan and plan.source_prompt == spec.prompt and plan.source_asset_ids == spec.asset_ids and options_match)


def design_plan(service, spec, job, *, correction=None, adjustment=None, deadline=None):
    images = reference_images(spec, service.assets)
    job.progress(5, "根据照片设计轮廓与造型参数" if images else "设计部件和尺寸")

    def observe(value):
        job.check()
        phase = value.get("phase")
        elapsed = value.get("elapsed_seconds", 0)
        chars = value.get("text_chars", 0)
        stages = {
            "connecting": "等待 AI 服务连接…",
            "waiting": "准备图像材料与几何约束…",
            "thinking": f"AI 正在推演三维造型（思考 {elapsed}s）",
            "content": f"AI 正在编写建模方案（已规划 {chars} 字）",
            "validating": "校验建模参数与曲面工具…",
        }
        job.record(ai_diagnostics=value, message=stages.get(phase, "等待模型设计参数"))

    options = {key: value for key, value in (("adjustment", adjustment), ("deadline", deadline)) if value is not None}
    plan = service.planner.design(spec, images, observe, correction=correction, **options)
    return apply_plan(service, spec, plan, job)


def apply_plan(service, spec, plan, job, *, allow_resize=False):
    job.check()
    plan.model_label = service.settings.values()["chat_model"][:100]
    spec.provider = "parametric"
    spec.schema_version = DesignSpec.model_fields["schema_version"].default
    spec.modeling_plan = plan
    height = next((rule["expected_mm"] for rule in compile_plan(plan)["constraints"] if rule["feature"] == "model.height"), None)
    if height is not None and allow_resize:
        spec.height_mm = height
    spec.assumptions = list(plan.assumptions)
    job.record(prepared_spec=spec.model_dump())
    return plan


def start_design(service, identifier, data):
    spec = DesignSpec.model_validate(data)
    if spec.mode not in ("text", "image", "multiview"):
        raise DomainError("请在文字或照片模式使用 AI 参数建模。")
    if not spec.prompt.strip() and not spec.asset_ids:
        raise DomainError("先输入想法或选择一张参考照片。")
    project = service.projects.get(identifier)
    parent = project["revision_id"]

    def work(job):
        design_plan(service, spec, job)
        with service.lock:
            if service.projects.get(identifier)["revision_id"] != parent:
                raise DomainError("作品版本已经改变，请在当前版本重新设计。", "REVISION_CHANGED")
        return {"spec": spec.model_dump(), "base_revision_id": parent}

    return service.jobs.start(
        "plan", identifier, work,
        {"spec": spec.model_dump(), "base_revision_id": parent},
    )
