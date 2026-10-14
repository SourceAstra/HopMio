"""将模板、图片与导入资产转换为同一建模请求。"""

import json
from .compiler import compile_plan
from .templates import template_plan
from ..contracts import DomainError, Mode
from ..geometry.images import contour, heights
from ..geometry.models import load_mesh
from ..reconstruction.preparing import prepare as prepare_surface


def prepare(spec, assets, repair=False, *, job=None, observer=None):
    if spec.provider == "reconstruction":
        return prepare_surface(spec, assets, job=job, observer=observer)
    if spec.provider == "parametric":
        plan = spec.modeling_plan
        if not plan or plan.source_prompt != spec.prompt or plan.source_asset_ids != spec.asset_ids:
            raise DomainError("想法或材料已改变，请重新设计方案。", "PLAN_STALE")
        if not plan.constraints:
            raise DomainError("方案没有可复测的尺寸约束，请重新设计。", "PLAN_MEASUREMENT")
        request = {"plan": compile_plan(plan)}
        if plan.surface:
            request["finish"] = {"base": spec.base and not any(step.id == "base" for step in plan.steps), "hole": False, "thickness_mm": spec.bottom_mm, "footprint": True}
        return request, {}, plan
    if spec.mode == Mode.TEXT:
        if spec.asset_ids:
            raise DomainError("参数模板不会处理照片。请切换到 AI 参数建模，先设计照片方案。", "PLAN_REQUIRED")
        plan = template_plan(spec)
        return {"plan": compile_plan(plan), "finish": finish(spec)}, {}, plan
    if not spec.asset_ids:
        raise DomainError("请先选择图片或模型。")
    path = assets.path(spec.asset_ids[0])
    if spec.mode == Mode.SILHOUETTE:
        step = {"id": "silhouette", "name": "照片轮廓", "shape": "polygon", "operation": "add", "size_mm": [spec.width_mm, spec.height_mm, spec.thickness_mm], "center_mm": [0, 0, 0], "rotation_deg": [90, 0, 0], "points": contour(path), "bevel_mm": 0}
        return {"plan": {"steps": [step], "constraints": []}, "finish": finish(spec)}, {}, None
    if spec.mode == Mode.RELIEF:
        return {"heightmap": heights(path, spec.relief_kind == "lithophane"), "size_mm": [spec.width_mm, spec.height_mm, spec.thickness_mm], "finish": finish(spec)}, {}, None
    if spec.mode == Mode.IMPORT:
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
