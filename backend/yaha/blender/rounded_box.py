"""平面圆角使用圆弧，板面保持平整；尺寸由毫米轮廓决定。"""

import math


def rounded_box(step):
    from tools import mesh_object, segments
    width, height, thickness = step["size_mm"]
    radius = step["corner_radius_mm"]
    points = [(-width / 2, -height / 2), (width / 2, -height / 2), (width / 2, height / 2), (-width / 2, height / 2)]
    if radius:
        points = []
        count = segments(radius) // 4
        for x, y, start in ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180)):
            for index in range(count + 1):
                angle = math.radians(start + 90 * index / count)
                points.append((x * (width / 2 - radius) + radius * math.cos(angle), y * (height / 2 - radius) + radius * math.sin(angle)))
    count = len(points)
    vertices = [(x, y, z) for z in (-thickness / 2, thickness / 2) for x, y in points]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return mesh_object(vertices, faces, step["name"])
