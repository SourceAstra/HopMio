"""将已有制造网格绑定为不可替换的编辑输入，复用受控几何工具。"""

import hashlib
import json
from .contracts import GeometryPlan
from ..contracts import DomainError
from ..geometry.models import load_mesh


def editable_spec(spec, project, assets):
    if spec.provider == "parametric" and spec.modeling_plan:
        return spec
    model = project.get("model")
    if not model:
        raise DomainError("先生成模型，再修改细节。", "AI_ADJUSTMENT_REQUIRES_PLAN")
    asset_id = model["stl_id"]
    content = assets.path(asset_id).read_bytes()
    height = float(load_mesh(assets.path(asset_id)).extents[2])
    spec = spec.model_copy(deep=True)
    spec.provider = "parametric"
    spec.height_mm = height
    # 原网格已含原有底座/孔，复用时不再次自动附加。
    spec.base = False
    spec.hole = False
    spec.asset_ids = [identifier for identifier in spec.asset_ids if assets.db.get("assets", identifier) and assets.db.get("assets", identifier).get("extension") in (".png", ".jpg", ".jpeg", ".webp")]
    spec.modeling_plan = GeometryPlan.model_validate({
        "schema_version": 8, "title": "保留原网格的细节编辑",
        "source_prompt": spec.prompt, "source_asset_ids": spec.asset_ids,
        "source_mesh": {"asset_id": asset_id, "sha256": hashlib.sha256(content).hexdigest(), "scale": {"parameter": "mesh_scale"}},
        "parameters": {"mesh_scale": {"value": 1, "label": "整体比例", "unit": "ratio", "ui": {"display_label": "整体大小", "control": "slider", "min": 0.1, "max": 2, "step": 0.05, "description": "等比放大或缩小，保持造型比例"}}},
        "steps": [], "constraints": [{"feature": "model.height", "expected_mm": {"op": "multiply", "args": [height, {"parameter": "mesh_scale"}]}, "max_error_mm": 0.01}],
        "assumptions": ["保留当前制造网格，通过局部布尔工具修改；原始扫描与历史版本保留。"],
    })
    return spec


def require_source(previous, candidate):
    source = previous.source_mesh
    target = candidate.source_mesh
    if source and (not target or source.asset_id != target.asset_id or source.sha256 != target.sha256):
        raise DomainError("编辑必须保留原始网格身份，不能以新造型替换原物体。", "AI_ADJUSTMENT_SOURCE")


def source_inputs(compiled, assets):
    source = compiled["source_mesh"]
    path = assets.path(source["asset_id"])
    if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
        raise DomainError("原始网格摘要已改变，请基于当前模型重新编辑。", "PLAN_STALE")
    mesh = load_mesh(path)
    mesh.apply_scale(source["scale"])
    return {"input.json": json.dumps({"vertices": mesh.vertices.tolist(), "faces": mesh.faces.tolist()}).encode()}
