"""照片轮廓和浮雕走本地算法，不把二维挤出称为 AI 三维重建。"""

import numpy as np
import trimesh
from PIL import Image, ImageOps
from shapely.geometry import Polygon
from ..contracts import DomainError


def silhouette(path, spec):
    import cv2

    rgba = np.array(Image.open(path).convert("RGBA"))
    alpha = rgba[:, :, 3]
    if alpha.min() < 128:
        mask = (alpha > 128).astype(np.uint8) * 255
    else:
        gray = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2GRAY)
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        if np.mean(mask) > 150:
            mask = 255 - mask
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise DomainError("没找到清晰轮廓，请使用白底深色画或透明背景图片。")
    contour = max(contours, key=cv2.contourArea)
    contour = cv2.approxPolyDP(
        contour, max(1, cv2.arcLength(contour, True) * 0.001), True
    )
    polygon = Polygon(contour[:, 0, :]).buffer(0)
    if polygon.is_empty or polygon.area < 20:
        raise DomainError("轮廓太小，请换一张主体更清晰的图片。")
    if polygon.geom_type != "Polygon":
        polygon = max(polygon.geoms, key=lambda p: p.area)
    mesh = trimesh.creation.extrude_polygon(
        polygon, spec.thickness_mm, engine="manifold"
    )
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, (1, 0, 0)))
    return mesh


def relief(path, spec):
    image = ImageOps.grayscale(Image.open(path))
    image = ImageOps.fit(image, (100, 100))
    values = np.array(image, dtype=float) / 255
    if spec.relief_kind == "lithophane":
        values = 1 - values
    n = 100
    xx, yy = np.meshgrid(
        np.linspace(0, spec.width_mm, n), np.linspace(0, spec.height_mm, n)
    )
    top = np.stack([xx, yy, 0.8 + values * (spec.thickness_mm - 0.8)], axis=-1).reshape(
        -1, 3
    )
    bottom = top.copy()
    bottom[:, 2] = 0
    vertices = np.concatenate([top, bottom])
    faces = []
    offset = n * n
    for y in range(n - 1):
        for x in range(n - 1):
            a = y * n + x
            b = a + 1
            c = a + n
            d = c + 1
            faces.extend(
                [
                    (a, b, d),
                    (a, d, c),
                    (a + offset, d + offset, b + offset),
                    (a + offset, c + offset, d + offset),
                ]
            )
    border = (
        list(range(n))
        + [y * n + n - 1 for y in range(1, n)]
        + list(range(n * n - 2, n * (n - 1) - 1, -1))
        + [y * n for y in range(n - 2, 0, -1)]
    )
    for a, b in zip(border, border[1:] + border[:1]):
        faces.extend([(a, b + offset, b), (a, a + offset, b + offset)])
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    mesh.fix_normals()
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, (1, 0, 0)))
    return mesh
