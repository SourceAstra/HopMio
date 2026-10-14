"""由等高闭合截面放样；参数是实际毫米，不再拉伸结果。"""

import math


def loft(step):
    from tools import segments, mesh_object
    count = segments(max(step["size_mm"]) / 2)
    vertices, faces = [], []
    for section in step["sections"]:
        power = 2 / section["exponent"]
        for index in range(count):
            x, y = math.cos(index * 2 * math.pi / count), math.sin(index * 2 * math.pi / count)
            vertices.append((section["offset_mm"][0] + math.copysign(abs(x) ** power, x) * section["width_mm"] / 2, section["offset_mm"][1] + math.copysign(abs(y) ** power, y) * section["depth_mm"] / 2, section["z_mm"]))
    for ring in range(len(step["sections"]) - 1):
        for index in range(count):
            a, b = ring * count + index, ring * count + (index + 1) % count
            faces.append((a, b, b + count, a + count))
    faces.extend((tuple(reversed(range(count))), tuple(range(len(vertices) - count, len(vertices)))))
    return mesh_object(vertices, faces, step["name"])
