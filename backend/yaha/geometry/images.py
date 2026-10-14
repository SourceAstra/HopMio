"""本地图像准备；只输出轮廓或高度数据，实体由 Blender 构建。"""

import cv2
import numpy as np
from PIL import Image, ImageOps
from shapely.geometry import Polygon
from ..contracts import DomainError


def contour(path):
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
    outline = max(contours, key=cv2.contourArea)
    outline = cv2.approxPolyDP(outline, max(1, cv2.arcLength(outline, True) * 0.004), True)
    polygon = Polygon(outline[:, 0, :]).buffer(0)
    if polygon.is_empty or polygon.area < 20:
        raise DomainError("轮廓太小或交叉，请换一张图片。")
    if polygon.geom_type != "Polygon":
        polygon = max(polygon.geoms, key=lambda item: item.area)
    points = list(polygon.exterior.coords)[:-1]
    if len(points) > 64:
        raise DomainError("轮廓过于复杂，请简化画面。")
    return [[float(x), -float(y)] for x, y in points]


def heights(path, inverse=False):
    image = ImageOps.fit(ImageOps.grayscale(Image.open(path)), (64, 64))
    values = np.array(image, dtype=float) / 255
    return ((1 - values) if inverse else values).tolist()
