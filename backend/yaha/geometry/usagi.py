"""效果图里的乌萨奇：大头短身、细长耳朵、眉毛、ω 嘴和脸颊刻线。

表情与内耳是同一个实体上的浅刻槽，单色 FDM 也能保留辨识度。
"""

import numpy as np
import trimesh
from .primitives import ellipsoid

HEAD_Z = 43.0
HEAD_RADII = (25.0, 18.0, 24.0)


def face_y(x, z):
    # 把表情投在椭球表面，避免只在平面上画线或产生悬空部件。
    return -HEAD_RADII[1] * np.sqrt(
        max(0.01, 1 - (x / HEAD_RADII[0]) ** 2 - ((z - HEAD_Z) / HEAD_RADII[2]) ** 2)
    )


def engraved_curve(points, radius=0.7):
    pieces = []
    for x, z in points:
        pieces.append(
            ellipsoid(
                (x, face_y(x, z) + 0.15, z), (radius, radius, radius), subdivisions=2
            )
        )
    for (x1, z1), (x2, z2) in zip(points, points[1:]):
        segment = np.array(
            [(x1, face_y(x1, z1) + 0.15, z1), (x2, face_y(x2, z2) + 0.15, z2)]
        )
        pieces.append(
            trimesh.creation.cylinder(radius=radius, segment=segment, sections=12)
        )
    return pieces


def quadratic(a, b, c, steps=18):
    return [
        (1 - t) ** 2 * np.array(a) + 2 * (1 - t) * t * np.array(b) + t * t * np.array(c)
        for t in np.linspace(0, 1, steps)
    ]


def usagi(spec):
    ear_half = 22 * spec.ear_scale
    parts = [
        ellipsoid((0, 0, 16), (15, 11, 17)),
        ellipsoid((0, 0, HEAD_Z), HEAD_RADII),
        ellipsoid((-10, 0, 78), (6.2, 4.8, ear_half)),
        ellipsoid((10, 0, 78), (6.2, 4.8, ear_half)),
        ellipsoid((-17, -7, 22), (6, 6, 8)),
        ellipsoid((17, -7, 22), (6, 6, 8)),
        ellipsoid((-8, -5, 3), (7, 9, 5)),
        ellipsoid((8, -5, 3), (7, 9, 5)),
    ]
    body = trimesh.boolean.union(parts, engine="manifold")
    cuts = [ellipsoid((x, -4.4, 78), (3.3, 2.2, ear_half - 4)) for x in (-10, 10)]
    for x in (-8, 8):
        cuts.append(ellipsoid((x, face_y(x, 47) + 0.35, 47), (2.4, 1.65, 3)))
    cuts.extend(engraved_curve(quadratic((-15, 56), (-12, 61), (-8, 58)), 0.65))
    cuts.extend(engraved_curve(quadratic((8, 58), (12, 61), (15, 56)), 0.65))
    cuts.append(ellipsoid((0, face_y(0, 41) + 0.15, 41), (1, 0.9, 0.8)))
    # 开口笑与上唇的 ω 线，保留乌萨奇的标志性表情。
    cuts.append(ellipsoid((0, face_y(0, 35.5) + 0.35, 35.5), (2.6, 1.6, 3.1)))
    cuts.extend(engraved_curve(quadratic((-5, 40), (-4, 36.5), (0, 40)), 0.65))
    cuts.extend(engraved_curve(quadratic((0, 40), (4, 36.5), (5, 40)), 0.65))
    cuts.extend(engraved_curve([(0, 41), (0, 40)], 0.6))
    for side in (-1, 1):
        for x in (14, 16.5, 19):
            cuts.extend(
                engraved_curve([(side * (x - 0.5), 43), (side * (x + 0.5), 40.5)], 0.55)
            )
    cutter = trimesh.boolean.union(cuts, engine="manifold")
    mesh = trimesh.boolean.difference([body, cutter], engine="manifold")
    mesh.fix_normals()
    return mesh
