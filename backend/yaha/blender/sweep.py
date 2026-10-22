"""沿三维曲线扫掠渐变椭圆截面，平行运输标架避免曲面扭转。"""

import math
from mathutils import Quaternion, Vector


def sweep(step):
    from tools import mesh_object
    path = step["path"]
    centers = [Vector(section["position_mm"]) for section in path]
    derivatives = [centers[1] - centers[0]]
    for previous, current, following in zip(centers, centers[1:], centers[2:]):
        before, after = current - previous, following - current
        # 分轴单调切线：平顶保持平顶，不在相邻控制点之外产生额外凸起。
        derivatives.append(Vector(tuple(2 * a * b / (a + b) if a * b > 0 else 0 for a, b in zip(before, after))))
    derivatives.append(centers[-1] - centers[-2])
    rings = []
    for index, (a, b) in enumerate(zip(centers, centers[1:])):
        start, end = path[index], path[index + 1]
        count = min(96, max(8, math.ceil((b - a).length / 0.5)))
        for sample in range(count):
            t = sample / count
            t2, t3 = t * t, t * t * t
            position = (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * derivatives[index] + (-2 * t3 + 3 * t2) * b + (t3 - t2) * derivatives[index + 1]
            blend = t2 * (3 - 2 * t)
            rings.append((position, *(start[key] + (end[key] - start[key]) * blend for key in ("width_mm", "depth_mm", "twist_deg"))))
    rings.append((centers[-1], *(path[-1][key] for key in ("width_mm", "depth_mm", "twist_deg"))))
    caps = step.get("cap", "round") == "round"
    poles = []
    if caps:
        first, last = rings[0], rings[-1]
        tangents = [(rings[1][0] - first[0]).normalized(), (last[0] - rings[-2][0]).normalized()]
        lengths = [sum(ring[1:3]) / 4 for ring in (first, last)]
        start, end = [], []
        radius = max(first[1:3] + last[1:3]) / 2
        count = max(8, math.ceil(math.pi / (4 * math.acos(1 - min(0.02 / radius, 1)))))
        for sample in range(1, count):
            angle = sample * math.pi / (2 * count)
            start.append((first[0] - tangents[0] * lengths[0] * math.cos(angle), first[1] * math.sin(angle), first[2] * math.sin(angle), first[3]))
            end.append((last[0] + tangents[1] * lengths[1] * math.sin(angle), last[1] * math.cos(angle), last[2] * math.cos(angle), last[3]))
        poles = [first[0] - tangents[0] * lengths[0], last[0] + tangents[1] * lengths[1]]
        rings = start + rings + end
    radius = max(max(ring[1:3]) for ring in rings) / 2
    radial = min(128, max(32, math.ceil(math.pi / math.acos(1 - min(0.02 / radius, 1)) / 4) * 4))
    vertices, faces = [], []
    previous, normal = None, None
    for index, (position, width, depth, twist) in enumerate(rings):
        tangent = (rings[min(index + 1, len(rings) - 1)][0] - rings[max(index - 1, 0)][0]).normalized()
        if tangent.length < 0.5:
            raise ValueError("扫掠曲线存在退化转折，请调整路径。")
        if previous is None:
            up = Vector((0, 0, 1)) if abs(tangent.z) < 0.9 else Vector((0, 1, 0))
            normal = up.cross(tangent).normalized()
        else:
            normal = previous.rotation_difference(tangent) @ normal
            normal = (normal - tangent * normal.dot(tangent)).normalized()
        side = Quaternion(tangent, math.radians(twist)) @ normal
        vertical = tangent.cross(side).normalized()
        for sample in range(radial):
            angle = sample * 2 * math.pi / radial
            vertices.append(position + side * (math.cos(angle) * width / 2) + vertical * (math.sin(angle) * depth / 2))
        previous = tangent
    for ring in range(len(rings) - 1):
        for sample in range(radial):
            a, b = ring * radial + sample, ring * radial + (sample + 1) % radial
            faces.append((a, b, b + radial, a + radial))
    if caps:
        count = len(vertices)
        vertices.extend(poles)
        faces.extend((count, (i + 1) % radial, i) for i in range(radial))
        faces.extend((count + 1, count - radial + i, count - radial + (i + 1) % radial) for i in range(radial))
    else:
        faces.extend((tuple(reversed(range(radial))), tuple(range(len(vertices) - radial, len(vertices)))))
    return mesh_object(vertices, faces, step["name"])
