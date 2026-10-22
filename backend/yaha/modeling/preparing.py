"""将模板、图片与导入资产转换为同一建模请求。"""

import json
from .compiler import compile_plan
from .templates import template_plan
from .fonts import lettering_inputs
from .intent import validate_intent
from ..contracts import DomainError, Mode
from ..geometry.images import contour, heights
from ..geometry.models import load_mesh
from ..reconstruction.preparing import prepare as prepare_surface
from .mesh_editing import source_inputs


def prepare(spec, assets, repair=False, *, job=None, observer=None, adjustment_intent=None):
    if spec.mode in (Mode.SILHOUETTE, Mode.RELIEF) and not (spec.modeling_plan and spec.modeling_plan.source_mesh):
        if not spec.asset_ids:
            raise DomainError("请先选择图片或模型。")
        path = assets.path(spec.asset_ids[0])
        if spec.mode == Mode.SILHOUETTE:
            step = {"id": "silhouette", "name": "照片轮廓", "shape": "polygon", "operation": "add", "size_mm": [spec.width_mm, spec.height_mm, spec.thickness_mm], "center_mm": [0, 0, 0], "rotation_deg": [90, 0, 0], "points": contour(path), "bevel_mm": 0}
            return {"plan": {"steps": [step], "constraints": []}, "finish": finish(spec)}, {}, None
        return {"heightmap": heights(path, spec.relief_kind == "lithophane", spec.width_mm, spec.height_mm), "size_mm": [spec.width_mm, spec.height_mm, spec.thickness_mm], "finish": finish(spec)}, {}, None
    if spec.provider == "reconstruction":
        return prepare_surface(spec, assets, job=job, observer=observer)
    if spec.provider == "parametric":
        plan = spec.modeling_plan
        if not plan or plan.source_prompt != spec.prompt or plan.source_asset_ids != spec.asset_ids:
            raise DomainError("想法或材料已改变，请重新设计方案。", "PLAN_STALE")
        if not plan.constraints:
            raise DomainError("方案没有可复测的尺寸约束，请重新设计。", "PLAN_MEASUREMENT")
        request = {"plan": compile_plan(plan)}
        validate_intent(spec, plan, request["plan"], adjustment_intent)
        if not plan.source_mesh and not adjustment_intent:
            dimensions = {"model.height": spec.height_mm}
            if spec.mode == Mode.TEXT and not spec.asset_ids:
                dimensions.update({"model.width": spec.width_mm, "model.depth": spec.depth_mm})
            request["plan"]["constraints"] = [rule for rule in request["plan"]["constraints"] if rule["feature"] not in dimensions] + [
                {"feature": feature, "expected_mm": expected, "max_error_mm": 0.05} for feature, expected in dimensions.items()
            ]
        has_base = any(step.id == "base" and step.operation == "add" for step in plan.steps)
        has_hole = any(step.operation == "subtract" and ("hole" in step.id.lower() or "孔" in step.name) for step in plan.steps)
        request["finish"] = finish(spec) | {"base": spec.base and not has_base, "hole": spec.hole and not has_hole, "thickness_mm": spec.bottom_mm, "footprint": bool(plan.surface)}
        inputs = lettering_inputs(request["plan"])
        if plan.source_mesh:
            inputs.update(source_inputs(request["plan"], assets))
        return request, inputs, plan
    if spec.mode == Mode.TEXT:
        if spec.asset_ids:
            raise DomainError("参数模板不会处理照片。请切换到 AI 参数建模，先设计照片方案。", "PLAN_REQUIRED")
        plan = template_plan(spec)
        return {"plan": compile_plan(plan), "finish": finish(spec)}, {}, plan
    if not spec.asset_ids:
        raise DomainError("请先选择图片或模型。")
    if spec.mode == Mode.IMPORT:
        path = assets.path(spec.asset_ids[0])
        asset = assets.db.get("assets", spec.asset_ids[0])
        if path.suffix == ".glb":
            scale = 0.001 if asset.get("kind") != "model-input" and asset.get("units", "mm") == "mm" else 1
            return {"plan": {"steps": [], "constraints": []}, "input_scale": scale, "repair": repair}, {"input.glb": path.read_bytes()}, None
        mesh = load_mesh(path)
        if mesh.units:
            mesh.convert_units("mm")
        content = json.dumps({"vertices": mesh.vertices.tolist(), "faces": mesh.faces.tolist()}).encode()
        return {"plan": {"steps": [], "constraints": []}, "repair": repair}, {"input.json": content}, None
    raise DomainError("照片参考需要先让 AI 设计参数方案。", "PLAN_REQUIRED")


def finish(spec):
    return {"base": spec.base, "hole": spec.hole, "hole_shape": spec.hole_shape, "thickness_mm": spec.thickness_mm}
