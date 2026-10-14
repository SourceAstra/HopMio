"""由任意星形轮廓制作圆润闭合薄面，可表达耳廓、叶片与柔软面板。"""

import math
from mathutils import Vector


def cushion(step):
    from tools import mesh_object
    points = [Vector(point) for point in step["points"]]
    outline = []
    for index, a in enumerate(points):
        before, b, after = (points[(index + shift) % len(points)] for shift in (-1, 1, 2))
        for sample in range(8):
            t = sample / 8
            outline.append(((2 * a) + (-before + b) * t + (2 * before - 5 * a + 4 * b - after) * t ** 2 + (-before + 3 * a - 3 * b + after) * t ** 3) / 2)
    low = [min(point[i] for point in outline) for i in range(2)]
    high = [max(point[i] for point in outline) for i in range(2)]
    center = Vector([(a + b) / 2 for a, b in zip(low, high)])
    outline = [Vector([(point[i] - center[i]) / (high[i] - low[i]) for i in range(2)]) for point in outline]
    vertices = [(0, 0, -0.5)]
    count, layers = len(outline), 24
    for layer in range(1, layers):
        angle = -math.pi / 2 + math.pi * layer / layers
        radius, z = math.cos(angle), math.sin(angle) / 2
        vertices.extend((point.x * radius, point.y * radius, z + step["camber"] * (point.x * radius * 2) ** 2) for point in outline)
    top = len(vertices)
    vertices.append((0, 0, 0.5))
    faces = [(0, 1 + (i + 1) % count, 1 + i) for i in range(count)]
    for layer in range(layers - 2):
        for i in range(count):
            a, b = 1 + layer * count + i, 1 + layer * count + (i + 1) % count
            faces.append((a, b, b + count, a + count))
    faces.extend((top, top - count + i, top - count + (i + 1) % count) for i in range(count))
    return mesh_object(vertices, faces, step["name"])
