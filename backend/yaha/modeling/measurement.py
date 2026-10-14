"""对导出的制造网格复测；未实现的特征不冒充通过。"""

import numpy as np
from ..contracts import DomainError
from ..geometry.models import load_mesh


def hits(mesh, origin, direction):
    triangles = mesh.triangles
    a = triangles[:, 0]
    e1, e2 = triangles[:, 1] - a, triangles[:, 2] - a
    h = np.cross(direction, e2)
    determinant = np.einsum("ij,ij->i", e1, h)
    valid = abs(determinant) > 1e-10
    inverse = np.divide(1, determinant, out=np.zeros_like(determinant), where=valid)
    s = origin - a
    u = inverse * np.einsum("ij,ij->i", s, h)
    q = np.cross(s, e1)
    v = inverse * np.einsum("j,ij->i", direction, q)
    t = inverse * np.einsum("ij,ij->i", e2, q)
    values = sorted(t[valid & (u >= -1e-8) & (v >= -1e-8) & (u + v <= 1 + 1e-8) & (t >= 0)])
    unique = []
    for distance in values:
        if not unique or abs(distance - unique[-1]) > 1e-5:
            unique.append(float(distance))
    return unique


def verify(path, manifest, constraints, observer=None):
    mesh = load_mesh(path)
    parts = mesh.split(only_watertight=False)
    if observer:
        observer({"source_topology": manifest.get("topology"), "faces": len(mesh.faces), "watertight": bool(mesh.is_watertight), "is_volume": bool(mesh.is_volume), "components": len(parts), "parts": [{"bounds_mm": part.bounds.round(4).tolist(), "faces": len(part.faces), "watertight": bool(part.is_watertight)} for part in parts]})
    if not mesh.is_volume or not mesh.is_watertight or len(parts) > 10:
        raise DomainError(f"Blender 网格复测未通过：{len(parts)} 个部件，封闭={bool(mesh.is_watertight)}，有效实体={bool(mesh.is_volume)}。", "BLENDER_GEOMETRY")
    measurements = dict(zip(("model.width", "model.depth", "model.height"), mesh.extents.tolist()))
    for identifier, feature in manifest.get("features", {}).items():
        local = mesh.copy()
        frame = np.array(feature["frame_m"], dtype=float)
        frame[:3, 3] *= 1000
        local.apply_transform(np.linalg.inv(frame))
        radius, height = feature["radius_mm"], feature["height_mm"]
        horizontal = hits(local, np.array([-radius - 2, 0.013, 0]), np.array([1., 0, 0]))
        vertical = hits(local, np.array([0.011, 0.013, -height / 2 - 2]), np.array([0., 0, 1.]))
        if len(horizontal) == 4:
            measurements[identifier + ".wall"] = min(horizontal[1] - horizontal[0], horizontal[3] - horizontal[2])
        if len(vertical) == 2:
            measurements[identifier + ".bottom"] = vertical[1] - vertical[0]
    report = []
    for rule in constraints:
        measured = measurements.get(rule["feature"])
        error = None if measured is None else abs(measured - rule["expected_mm"])
        report.append(rule | {"measured_mm": measured, "error_mm": error, "status": "unverified" if measured is None else "pass" if error <= rule["max_error_mm"] else "fail"})
    if any(item["status"] != "pass" for item in report):
        failed = next(item for item in report if item["status"] != "pass")
        raise DomainError("尺寸复测未通过：" + failed["feature"] + "，请修改参数或重新设计。", "BLENDER_DIMENSION")
    return mesh, report
