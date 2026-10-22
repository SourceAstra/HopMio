"""明确的静态检查；壁厚和支撑不能由外包围盒证明。"""

import hashlib
import json
from datetime import datetime, timezone
from .geometry.models import load_mesh, split_shells


def profile_hash(profile):
    return hashlib.sha256(json.dumps(profile, sort_keys=True).encode()).hexdigest()


def inspect(project, assets, profile):
    mesh = load_mesh(assets.path(project["model"]["stl_id"]))
    limit = 180 - 2 * profile.margin_mm
    fits = bool((mesh.extents <= limit).all())
    closed = bool(mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0)
    parts, cavities = split_shells(mesh)
    components = len(parts)
    # 独立且离开底面的部件不会因整体网格封闭而自动连接到主体。
    floating = sum(float(part.bounds[0][2] - mesh.bounds[0][2]) > 0.2 for part in parts)
    items = [
        {
            "name": "A1 mini 空间",
            "status": "pass" if fits else "fail",
            "detail": f"作品 {mesh.extents.round(1).tolist()} mm；可用边长 {limit:g} mm（含留边）。",
        },
        {
            "name": "封闭与朝向",
            "status": "pass" if closed else "fail",
            "detail": "网格封闭、法线一致且体积为正。"
            if closed
            else "发现开口或朝向问题，请修复后再准备打印。",
        },
        {
            "name": "独立部件",
            "status": "pass" if components == 1 else "warn",
            "detail": f"检测到 {components} 个部件。" + (f"其中 {floating} 个部件悬空且未与主体连接；镂空字的封闭内圈可能造成这种情况，请加连桥或调整字形。支撑不会自动把它们连回主体。" if floating else "多个部件需要检查是否接触。" if components > 1 else "主体连为一体。"),
        },
        {
            "name": "壁厚与细节",
            "status": "warn",
            "detail": "当前未进行全模型壁厚求解；请在 Bambu Studio 检查薄壁、孔径和首层。",
        },
        {
            "name": "支撑与摆放",
            "status": "warn",
            "detail": "凸出的手臂、耳朵等可能需要支撑；请查看实际切片预览。",
        },
    ]
    return {
        "profile": profile.model_dump(),
        "revision_id": project["revision_id"],
        "profile_hash": profile_hash(profile.model_dump()),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "can_prepare": fits and closed,
        "items": items,
        "size_mm": mesh.extents.round(2).tolist(),
        "components": components,
        "cavity_shells": len(cavities),
    }
