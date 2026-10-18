"""本地图像准备；只输出轮廓或高度数据，实体由 Blender 构建。"""

import math

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps
from shapely.geometry import Polygon
from ..contracts import DomainError

# 高度图网格预算：工业级高精浮雕规格，约 9 万格 ≈ 36 万三角面，兼顾商业级细腻度与制造鲁棒性。
GRID_POINTS_PER_MM = 2.4
GRID_CELL_BUDGET = 90000
GRID_MIN_POINTS = 64
SEGMENT_MAX_PIXELS = 1080


def load_image(path):
    image = Image.open(path)
    image.load()
    return ImageOps.exif_transpose(image)


def contour(path):
    rgba = np.array(load_image(path).convert("RGBA"))
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
    raw_outline = max(contours, key=cv2.contourArea)
    arc = cv2.arcLength(raw_outline, True)

    # 自适应曲率逼近，保留手绘真实笔触细节，点数过多时平滑收敛，严禁硬性报错阻塞
    outline = cv2.approxPolyDP(raw_outline, max(0.8, arc * 0.003), True)
    polygon = Polygon(outline[:, 0, :]).buffer(0)
    if polygon.is_empty or polygon.area < 20:
        raise DomainError("轮廓太小或交叉，请换一张图片。")
    if polygon.geom_type != "Polygon":
        polygon = max(polygon.geoms, key=lambda item: item.area)

    points = list(polygon.exterior.coords)[:-1]
    # 若点数仍然过多（大于 160 点），进行平滑自适应抽稀，严禁抛出 DomainError 打断用户
    if len(points) > 160:
        simplified = polygon.simplify(max(0.5, arc * 0.006), preserve_topology=True)
        if simplified.geom_type == "Polygon" and not simplified.is_empty:
            points = list(simplified.exterior.coords)[:-1]
        if len(points) > 192:
            # 极复杂图形降采样到合理上限
            step = max(1, len(points) // 160)
            points = points[::step]

    return [[float(x), -float(y)] for x, y in points]


def grid_shape(width_mm, height_mm, budget=GRID_CELL_BUDGET):
    scale = min(GRID_POINTS_PER_MM, math.sqrt(budget / max(width_mm * height_mm, 1.0)))
    columns, rows = round(width_mm * scale), round(height_mm * scale)
    grow = max(GRID_MIN_POINTS / columns, GRID_MIN_POINTS / rows, 1.0)
    columns, rows = round(columns * grow), round(rows * grow)
    shrink = math.sqrt(budget / max((columns - 1) * (rows - 1), 1))
    if shrink < 1:
        columns, rows = max(24, round(columns * shrink)), max(24, round(rows * shrink))
    return max(columns, 2), max(rows, 2)


def focus_crop(image, aspect):
    """按边缘能量挑最有内容、略靠中心的窗口，避免把杂乱背景刻进浮雕。"""
    width, height = image.size
    if width < 8 or height < 8 or abs(width / height - aspect) < 0.01:
        return image
    if aspect >= width / height:
        base_w, base_h = width, width / aspect
    else:
        base_w, base_h = height * aspect, height
    energy = cv2.integral(np.array(image.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32))
    best_box, best_score = None, -1.0
    for fraction in np.linspace(1.0, 0.4, 13):
        box_w, box_h = round(base_w * fraction), round(base_h * fraction)
        if box_w < 4 or box_h < 4:
            continue
        for offset_y in np.linspace(0.0, 1.0, 7):
            for offset_x in np.linspace(0.0, 1.0, 7):
                x0, y0 = round((width - box_w) * offset_x), round((height - box_h) * offset_y)
                density = energy[y0 + box_h, x0 + box_w] - energy[y0, x0 + box_w] - energy[y0 + box_h, x0] + energy[y0, x0]
                center_x, center_y = x0 + box_w / 2, y0 + box_h / 2
                bias = math.exp(-(((center_x - width / 2) / (0.55 * width)) ** 2 + ((center_y - height / 2) / (0.55 * height)) ** 2))
                score = float(density) / (box_w * box_h) * bias * math.sqrt(fraction)
                if score > best_score:
                    best_box, best_score = (x0, y0, x0 + box_w, y0 + box_h), score
    return image.crop(best_box)


def detect_face(gray):
    try:
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        if cascade.empty():
            return None
        faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(max(24, gray.shape[1] // 12), max(24, gray.shape[1] // 12)))
        if not len(faces):
            return None
        return max(faces, key=lambda item: item[2] * item[3])
    except Exception:
        return None


def subject_mask(image):
    """GrabCut 估计前景主体；人脸检测作为前景种子，覆盖异常时放弃分割。"""
    width, height = image.size
    if min(width, height) < 120:
        return None
    scale = min(1.0, SEGMENT_MAX_PIXELS / max(width, height))
    size = (max(round(width * scale), 32), max(round(height * scale), 32))
    rgb = np.array(image.convert("RGB").resize(size, Image.Resampling.BOX))
    mask = np.full(size[::-1], cv2.GC_PR_BGD, dtype=np.uint8)
    x0, y0 = round(size[0] * 0.16), round(size[1] * 0.08)
    x1, y1 = round(size[0] * 0.84), round(size[1] * 0.92)
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
    face = detect_face(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY))
    if face is not None:
        fx, fy, fw, fh = face
        margin = int(max(fw, fh) * 0.7)
        mask[max(fy - margin, 0):fy + fh + margin, max(fx - margin, 0):fx + fw + margin] = cv2.GC_FGD
    try:
        cv2.grabCut(rgb, mask, None, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return None
    binary = np.isin(mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
    if not 0.10 < binary.mean() < 0.90:
        return None
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
    if count > 2:
        areas = stats[1:, cv2.CC_STAT_AREA]
        keep = np.zeros(count, bool)
        keep[1 + np.flatnonzero(areas >= areas.max() * 0.15)] = True
        binary = keep[labels].astype(np.uint8)
    if binary.mean() < 0.05:
        return None
    feather = max(9, round(min(size) * 0.06)) | 1
    return cv2.GaussianBlur(binary.astype(np.float32), (feather, feather), 0)


def is_line_art(image):
    """大片纯色说明是白底画或线稿，对比策略与照片不同。"""
    gray = np.array(image.convert("L").resize((128, 128)), dtype=np.float32) / 255
    return float(((gray < 0.08) | (gray > 0.92)).mean()) > 0.5


def height_field(image, columns, rows, inverse, mask=None, flat=False):
    """2 倍超采样处理再降到目标网格；浮雕用主体区域归一化并收平背景纹理。"""
    preview = image.convert("L")
    if max(preview.size) > 1400:
        preview.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
    work = (columns * 2, rows * 2)
    grid = np.array(preview.resize(work, Image.Resampling.LANCZOS), dtype=np.uint8)
    grid = cv2.bilateralFilter(grid, 9, 40, 7)
    if not flat:
        grid = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(grid)
    values = np.array(grid, dtype=np.float32) / 255
    values += (0.25 if flat or inverse else 0.6) * (values - cv2.GaussianBlur(values, (0, 0), 1.0))
    soft = None if mask is None else cv2.resize(mask, work, interpolation=cv2.INTER_LINEAR)
    low, high = np.percentile(values, 2), np.percentile(values, 98)
    if soft is not None:
        core = soft > 0.6
        if core.sum() > 32:
            inside = np.percentile(values[core], (2, 98))
            if inside[1] - inside[0] >= 0.08:
                low, high = inside
    values = np.clip((values - low) / max(high - low, 1e-6), 0.0, 1.0)
    if not inverse and soft is not None and (soft < 0.2).any():
        background = float(np.percentile(values[soft < 0.2], 50))
        values = background + (values - background) * (0.16 + 0.84 * soft)
    if inverse:
        values = values ** 1.5
    elif not flat:
        smooth = values * values * (3 - 2 * values)
        values = 0.45 * values + 0.55 * smooth
    values = cv2.resize(values, (columns, rows), interpolation=cv2.INTER_AREA)
    values = feather_edges(values)
    values = cv2.GaussianBlur(values, (3, 3), 0)
    peak, floor = float(values.max()), float(values.min())
    if peak > 0.1:
        # 平滑会轻微缩回极值；重新锚定，保证厚度用满声明量程。
        if inverse:
            values = np.clip((values - floor) / max(peak - floor, 1e-6), 0.0, 1.0)
        else:
            values = np.minimum(values / peak, 1.0)
    return ((1 - values) if inverse else values).tolist()


def feather_edges(values, band=0.035, strength=0.45):
    """边框向四周均值轻微收平，避免背景纹理漫到边界形成毛刺。"""
    rows, columns = values.shape
    band_x, band_y = max(1, round(columns * band)), max(1, round(rows * band))
    frame = np.concatenate([values[:, :band_x].ravel(), values[:, -band_x:].ravel(), values[:band_y].ravel(), values[-band_y:].ravel()])
    ramp_x = np.minimum(np.arange(columns) + 1.0, (np.arange(columns)[::-1] + 1.0)) / band_x
    ramp_y = np.minimum(np.arange(rows) + 1.0, (np.arange(rows)[::-1] + 1.0)) / band_y
    weight = np.clip(np.minimum(ramp_x[np.newaxis, :], ramp_y[:, np.newaxis]), 0.0, 1.0)
    return values + strength * (1 - weight) * (float(frame.mean()) - values)


def heights(path, inverse=False, width_mm=None, height_mm=None, budget=GRID_CELL_BUDGET):
    columns, rows = grid_shape(width_mm or 100.0, height_mm or 100.0, budget)
    image = focus_crop(load_image(path), columns / rows)
    flat = is_line_art(image)
    mask = None if inverse or flat else subject_mask(image)
    return height_field(image, columns, rows, inverse, mask, flat)
