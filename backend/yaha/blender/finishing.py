"""模板装饰只添加实体或切孔，不缩放整个模型。"""

import math
import bpy
from mathutils import Vector
from tools import boolean, part


def bounds(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    points = [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices]
    if not points:
        raise ValueError("模型没有有效实体。")
    return [Vector(tuple(fn(v[i] for v in points) for i in range(3))) for fn in (min, max)]


def finish(body, options):
    low, high = bounds(body)
    center = (low + high) / 2
    size = (high - low) * 1000
    thickness = options["thickness_mm"]
    common = {"operation": "add", "rotation_deg": [0, 0, 0], "points": [], "bevel_mm": 0}
    if options["base"]:
        diameter = max(size.x, size.y) * 1.08
        if options.get("footprint"):
            evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            feet = [evaluated.matrix_world @ vertex.co for vertex in evaluated.data.vertices if (evaluated.matrix_world @ vertex.co).z <= low.z + thickness / 1000]
            if feet:
                center.x, center.y = ((min(p[i] for p in feet) + max(p[i] for p in feet)) / 2 for i in range(2))
                diameter = 2 * max(math.hypot(point.x - center.x, point.y - center.y) for point in feet) * 1000 + 6
        step = common | {"id": "base", "name": "底座", "shape": "cylinder", "size_mm": [diameter] * 2 + [thickness], "center_mm": [center.x * 1000, center.y * 1000, low.z * 1000 + thickness / 2], "bevel_mm": min(0.6, thickness / 4) if options.get("footprint") else 0}
        body = boolean(body, part(step), "UNION")
    if options["hole"]:
        radius = max(1.6, thickness * 0.6)
        step = common | {"id": "hole", "name": "挂孔", "shape": "cylinder", "size_mm": [radius * 2, radius * 2, size.y + 4], "center_mm": [center.x * 1000, center.y * 1000, low.z * 1000 + size.z * 0.82], "rotation_deg": [90, 0, 0]}
        if options["hole_shape"] == "heart":
            points = []
            for index in range(48):
                angle = index * 2 * math.pi / 48
                points.append((16 * math.sin(angle) ** 3, 13 * math.cos(angle) - 5 * math.cos(2 * angle) - 2 * math.cos(3 * angle) - math.cos(4 * angle)))
            step.update(shape="polygon", points=points)
        body = boolean(body, part(step), "DIFFERENCE")
    bpy.context.view_layer.update()
    return body
