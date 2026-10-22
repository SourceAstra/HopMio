"""流线陀螺 v1：闭合极坐标曲面，输入毫米、输出米；不依赖 AI。"""

import math


def smooth(value):
    t = max(0.0, min(1.0, value))
    return t * t * t * (10 + t * (-15 + 6 * t))


def build(parameters):
    from tools import mesh_object
    radius = parameters["diameter_mm"] / 2
    height = parameters["height_mm"]
    dimple = (9.5 / 30) * parameters["dimple_width"]
    depth = 4 * parameters["dimple_depth"]
    relief = parameters["blade_relief"]
    twist = math.radians(parameters["twist_deg"])
    radial, angular = 96, 192

    def surfaces(u, theta, cosine):
        # 统一用半径比例定义外形；深度与起伏是造型系数，最后定标总高。
        top = 21.5 - depth * (1 - (u / dimple) ** 2) ** 3 if u < dimple else 21.5 - 8 * smooth((u - dimple) / (1 - dimple))
        bottom = 9.5 * (1 - (1 - (u / 0.3) ** 2) ** 3) if u < 0.3 else 9.5 - smooth((u - 0.3) / 0.7)
        middle, half = (top + bottom) / 2, (top - bottom) / 2
        # r=R sin(alpha)，共享 z=middle+half cos(alpha)，外缘两侧有同一竖直切线。
        mask = smooth((u - dimple) / 0.15) * (1 - smooth((u - 0.85) / 0.15))
        phase = 3 * (theta - twist * (u - dimple) / (1 - dimple))
        # 波幅受局部半厚度约束：最大强度 1.5、谐波绝对值 <=0.8，仍保留正厚度。
        wave = half * cosine * relief * mask * (0.55 * math.cos(phase) + 0.25 * math.cos(2 * phase - 0.5))
        return middle + half * cosine + wave, middle - half * cosine

    vertices = [(0, 0, 21.5 - depth), (0, 0, 0)]
    top_rings, bottom_rings = [], []
    for i in range(1, radial + 1):
        alpha = math.pi * i / (2 * radial)
        u, cosine = math.sin(alpha), math.cos(alpha)
        upper, lower = [], []
        for j in range(angular):
            theta = 2 * math.pi * j / angular
            x, y = radius * u * math.cos(theta), radius * u * math.sin(theta)
            z_top, z_bottom = surfaces(u, theta, cosine)
            if i < radial and z_top <= z_bottom:
                raise ValueError("曲面上下表面相交，请减小叶片起伏。")
            upper.append(len(vertices))
            vertices.append((x, y, z_top))
            if i == radial:
                lower.append(upper[-1])
            else:
                lower.append(len(vertices))
                vertices.append((x, y, z_bottom))
        top_rings.append(upper)
        bottom_rings.append(lower)

    faces = []
    for j in range(angular):
        following = (j + 1) % angular
        faces.extend(((0, top_rings[0][j], top_rings[0][following]), (1, bottom_rings[0][following], bottom_rings[0][j])))
    for i in range(radial - 1):
        for j in range(angular):
            following = (j + 1) % angular
            faces.append((top_rings[i][j], top_rings[i + 1][j], top_rings[i + 1][following], top_rings[i][following]))
            faces.append((bottom_rings[i][j], bottom_rings[i][following], bottom_rings[i + 1][following], bottom_rings[i + 1][j]))
    low, high = min(point[2] for point in vertices), max(point[2] for point in vertices)
    vertices = [(x / 1000, y / 1000, (z - low) * height / (high - low) / 1000) for x, y, z in vertices]
    obj = mesh_object(vertices, faces, "流线陀螺 · 连续曲面")
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj
