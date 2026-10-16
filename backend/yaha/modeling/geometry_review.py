"""无视觉模型时记录实际网格与尺寸证据，不将几何复测冒充外观审阅。"""
import hashlib
import math
import numpy as np
from ..contracts import DomainError
from ..geometry.models import load_mesh


def geometry_digest(mesh):
    # 忽略 STL 文件头、顶点索引与面顺序，比较实际毫米坐标。
    triangles = np.round(np.asarray(mesh.triangles), 5)
    order = np.lexsort((triangles[:, :, 2], triangles[:, :, 1], triangles[:, :, 0]), axis=1)
    rows = np.take_along_axis(triangles, order[:, :, None], axis=1).reshape(-1, 9)
    rows = rows[np.lexsort(tuple(rows[:, column] for column in reversed(range(9))))]
    rows[rows == 0] = 0  # 归一化浮点负零。
    return hashlib.sha256(rows.tobytes()).hexdigest()


def review_geometry(service, spec, result, project, job, *, adjustment=None, require_change=False):
    built, mesh, measurements = result
    job.check()
    job.progress(88, "复测实际网格、尺寸与文字工具；外观留待人工确认")
    geometry = built.manifest.get("geometry_check") or {}
    if not geometry.get("watertight") or not geometry.get("is_volume") or not mesh.is_volume:
        raise DomainError("实际网格没有通过封闭实体复测，原模型保留。", "BLENDER_GEOMETRY")
    if not measurements or any(item.get("status") != "pass" for item in measurements):
        raise DomainError("缺少已通过的尺寸复测，原模型保留。", "BLENDER_DIMENSION")
    digest = geometry_digest(mesh)
    previous_digest = None
    previous_id = (project.get("model") or {}).get("stl_id")
    if require_change and previous_id:
        previous_digest = geometry_digest(load_mesh(service.assets.path(previous_id)))
        if previous_digest == digest:
            raise DomainError("实际导出的网格没有发生变化，调整未应用，原模型保留。", "AI_ADJUSTMENT_UNCHANGED")
    effects = {effect["id"]: effect for effect in built.manifest.get("lettering_effects", [])}
    steps = spec.modeling_plan.steps if spec.modeling_plan else []
    for index, step in enumerate(steps):
        if step.shape != "text" or index == 0 and not spec.modeling_plan.surface:
            continue
        effect = effects.get(step.id, {})
        volume = effect.get("volume_change_mm3")
        if effect.get("text") != step.text or effect.get("operation") != step.operation or type(volume) not in (int, float) or not math.isfinite(volume) or volume <= 1e-4:
            raise DomainError("文字工具没有提供有效的实际布尔运算证据，原模型保留。", "AI_ADJUSTMENT_LETTERING")
    report = {
        "schema_version": "yaha.design-review/v1", "status": "geometry_verified", "scope": "geometry_only",
        "visual_status": "unverified",
        "message": "模型已更新，实际网格与尺寸复测通过；当前文字模型未进行视觉审阅，请旋转模型确认文字、位置及其他外观细节。",
        "final_stl_sha256": hashlib.sha256(built.files["stl"]).hexdigest(),
        "evidence": [{"kind": "local_geometry", "geometry": geometry, "measurements": measurements,
                      "geometry_sha256": digest, "previous_geometry_sha256": previous_digest,
                      "lettering_effects": list(effects.values()), "scope_validation": (adjustment or {}).get("scope_validation", "not_requested")}],
    }
    built.manifest["design_review"] = report
    job.record(design_review=report)
    return spec, result
