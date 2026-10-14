"""照片灰度转封闭浮雕，所有几何在 Blender 内创建。"""

import math
from tools import mesh_object


def build_heightmap(request):
    levels = request["heightmap"]
    rows, columns = len(levels), len(levels[0])
    width, height, thickness = [size / 1000 for size in request["size_mm"]]
    vertices = [(x * width / (columns - 1) - width / 2, y * height / (rows - 1) - height / 2, 0 if back else 0.0008 + float(levels[rows - 1 - y][x]) * (thickness - 0.0008)) for back in (False, True) for y in range(rows) for x in range(columns)]
    count, faces = rows * columns, []
    for y in range(rows - 1):
        for x in range(columns - 1):
            a = y * columns + x
            quad = (a, a + 1, a + columns + 1, a + columns)
            faces.extend((quad, tuple(index + count for index in reversed(quad))))
    border = list(range(columns)) + [y * columns + columns - 1 for y in range(1, rows)] + list(range(count - 2, count - columns - 1, -1)) + [y * columns for y in range(rows - 2, 0, -1)]
    faces += [(a, b, b + count, a + count) for a, b in zip(border, border[1:] + border[:1])]
    obj = mesh_object(vertices, faces, "照片浮雕")
    obj.rotation_euler.x = math.pi / 2
    return obj
