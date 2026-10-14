"""通用照片轮廓约束：估计视角、有限形变、只接受观测误差改善。"""

import hashlib
import json
import math
import time
from dataclasses import dataclass
from typing import Protocol
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates
from .runtime import runtime
from ..contracts import DomainError


@dataclass
class OutlineResult:
    mesh: bytes | None
    report: dict


class OutlineFitter(Protocol):
    def fit(self, spec, source: bytes, assets, job, progress=None, *, deadline=None) -> OutlineResult: ...
    def evaluate(self, source: bytes, report: dict) -> dict: ...
    def discard(self, identifier: str): ...


def foreground(path, region):
    with Image.open(path) as image:
        image.thumbnail((900, 900))
        if "A" in image.getbands() and image.getchannel("A").getextrema()[0] < 255:
            mask = np.asarray(image.getchannel("A")) > 32
        else:
            rgb = np.array(image.convert("RGB"))
            height, width = rgb.shape[:2]
            x, y, w, h = region
            pad = max(3, round(min(width, height) * 0.01))
            low_x, low_y = max(1, round(x * width) - pad), max(1, round(y * height) - pad)
            high_x, high_y = min(width - 1, round((x + w) * width) + pad), min(height - 1, round((y + h) * height) + pad)
            labels = np.zeros((height, width), np.uint8)
            cv2.grabCut(rgb, labels, (low_x, low_y, high_x - low_x, high_y - low_y), np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_RECT)
            mask = (labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count < 2:
        raise ValueError("照片没有可用主体轮廓")
    mask = (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    ys, xs = np.nonzero(mask)
    if len(xs) < 100:
        raise ValueError("照片主体过小")
    crop = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    scale = min(288 / crop.shape[1], 224 / crop.shape[0])
    crop = cv2.resize(crop, (max(1, round(crop.shape[1] * scale)), max(1, round(crop.shape[0] * scale))), interpolation=cv2.INTER_NEAREST)
    canvas = np.zeros((320, 384), np.uint8)
    y, x = (320 - crop.shape[0]) // 2, (384 - crop.shape[1]) // 2
    canvas[y:y + crop.shape[0], x:x + crop.shape[1]] = crop
    return canvas


def projection(vertices, view):
    yaw, elevation = np.radians([view["yaw_deg"], view["elevation_deg"]])
    right = np.array([math.cos(yaw), math.sin(yaw), 0])
    up = np.array([-math.sin(yaw) * math.sin(elevation), math.cos(yaw) * math.sin(elevation), math.cos(elevation)])
    direction = np.cross(right, up)
    relative = vertices - (vertices.min(axis=0) + vertices.max(axis=0)) / 2
    factor = np.ones(len(vertices))
    if view["distance_ratio"]:
        distance = max(np.ptp(vertices[:, 2]), 1) * view["distance_ratio"]
        factor = np.clip(distance / np.maximum(distance - relative @ direction, distance * 0.15), 0.2, 5)
    xy = np.column_stack((relative @ right, relative @ up)) * factor[:, None]
    low, high = xy.min(axis=0), xy.max(axis=0)
    scale = view["height_px"] / max(high[1] - low[1], 1e-6)
    pixels = (xy - (low + high) / 2) * [scale, -scale] + [192, 160]
    return pixels, scale, factor, right, up


def raster(vertices, view):
    pixels, *_ = projection(vertices, view)
    xy = np.rint(pixels).astype(np.int32)
    valid = (xy[:, 0] >= 0) & (xy[:, 0] < 384) & (xy[:, 1] >= 0) & (xy[:, 1] < 320)
    mask = np.zeros((320, 384), np.uint8)
    mask[xy[valid, 1], xy[valid, 0]] = 1
    return cv2.morphologyEx(cv2.dilate(mask, np.ones((3, 3), np.uint8)), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))


def score(vertices, view):
    rendered = raster(vertices, view).astype(bool)
    target = view["mask"].astype(bool)
    return np.count_nonzero(rendered & target) / max(1, np.count_nonzero(rendered | target))


def mesh_data(source):
    data = json.loads(source)
    vertices, faces = np.asarray(data["vertices"], np.float64), np.asarray(data["faces"], np.int32)
    if vertices.ndim != 2 or vertices.shape[1] != 3 or faces.ndim != 2 or faces.shape[1] != 3 or not 0 < len(vertices) <= 200000 or not 0 < len(faces) <= 200000 or not np.isfinite(vertices).all() or faces.min() < 0 or faces.max() >= len(vertices):
        raise DomainError("轮廓拟合的网格数据无效。", "OUTLINE_INPUT")
    return vertices, faces


def smooth_cage(original, displacement, maximum):
    """形变场的 Lipschitz 上界小于1，保持空间连续且抑制曲面折叠。"""
    spacing = max(2, np.ptp(original[:, 2]) / 24)
    coordinates = (original - original.min(axis=0)) / spacing + 2
    shape = tuple(np.ceil(coordinates.max(axis=0)).astype(int) + 3)
    indices = np.rint(coordinates).astype(int)
    flat = np.ravel_multi_index(indices.T, shape)
    weights = gaussian_filter(np.bincount(flat, minlength=np.prod(shape)).reshape(shape).astype(float), 1)
    fields = []
    for axis in range(3):
        values = np.bincount(flat, weights=displacement[:, axis], minlength=np.prod(shape)).reshape(shape)
        fields.append(gaussian_filter(values, 1) / np.maximum(weights, 0.01))
    field = np.stack(fields, axis=-1)
    bound = sum(float(np.linalg.norm(np.diff(field, axis=axis), axis=-1).max()) / spacing for axis in range(3))
    field *= min(1, 0.6 / max(bound, 1e-9))
    result = np.column_stack([map_coordinates(field[..., axis], coordinates.T, order=1, mode="nearest") for axis in range(3)])
    result *= np.minimum(1, maximum / np.maximum(np.linalg.norm(result, axis=1), 1e-9))[:, None]
    return result


class OpenCVOutlineFitter:
    def __init__(self):
        self._views = {}

    def fit(self, spec, source, assets, job, progress=None, *, deadline=None):
        config = runtime().get("outline_fitting", {})
        seconds, iterations = config.get("max_seconds", 180), config.get("iterations", 12)
        ratio = config.get("max_displacement_ratio", 0.08)
        if not config.get("enabled", True):
            return OutlineResult(None, {"status": "disabled"})
        if not 10 <= seconds <= 600 or not isinstance(iterations, int) or not 1 <= iterations <= 24 or not 0 < ratio <= 0.2:
            raise DomainError("轮廓拟合预算配置无效。", "OUTLINE_CONFIG")
        deadline = min(time.monotonic() + seconds, deadline if deadline is not None else float("inf"))

        def check():
            job.check()
            if time.monotonic() >= deadline:
                raise DomainError("轮廓拟合超时，保留参数造型。", "OUTLINE_TIMEOUT")

        original, faces = mesh_data(source)
        views, skipped, observed = [], [], []
        hints = {view.photo_index: view for view in spec.modeling_plan.reference_views}
        for index, identifier in enumerate(spec.asset_ids):
            check()
            if progress:
                progress(5 + 45 * index / len(spec.asset_ids), f"提取并对齐第{index + 1}/{len(spec.asset_ids)}张照片的实际轮廓")
            hint = hints.get(index)
            if hint and not hint.full_object:
                skipped.append({"asset_id": identifier, "reason": "细节特写用于参数设计"})
                continue
            try:
                mask = foreground(assets.path(identifier), hint.region if hint else (0.02, 0.02, 0.96, 0.96))
                ys, _ = np.nonzero(mask)
                base = {"asset_id": identifier, "mask": mask, "height_px": int(ys.max() - ys.min() + 1)}
                yaws = [hint.yaw_deg + delta for delta in (-20, 0, 20)] if hint else range(-180, 180, 30)
                elevations = [max(-25, min(70, hint.elevation_deg + delta)) for delta in (-10, 0, 10)] if hint else (0, 15, 30)
                candidates = [base | {"yaw_deg": yaw, "elevation_deg": elevation, "distance_ratio": distance} for yaw in yaws for elevation in elevations for distance in (0, 4)]
                best, quality = None, -1
                for candidate in candidates:
                    check()
                    value = score(original, candidate)
                    if value > quality:
                        best, quality = candidate, value
                observed.append(best | {"observation_iou": quality})
                if quality < 0.4:
                    skipped.append({"asset_id": identifier, "reason": "估计视角与主体轮廓不一致"})
                    continue
                inside = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
                outside = cv2.distanceTransform(1 - mask, cv2.DIST_L2, 5)
                best["sdf"] = inside - outside
                best["gradient"] = np.stack(np.gradient(best["sdf"])[::-1], axis=-1)
                best["before_iou"] = quality
                views.append(best)
            except (cv2.error, ValueError, OSError):
                skipped.append({"asset_id": identifier, "reason": "主体分割不可靠"})
        report = {"schema_version": "yaha.outline-fit/v1", "status": "unchanged", "camera_status": "estimated", "input_views": len(spec.asset_ids), "full_object_views": len(spec.asset_ids) - sum(item["reason"] == "细节特写用于参数设计" for item in skipped), "used_views": len(views), "skipped": skipped, "algorithm": "silhouette-cage-v2", "max_displacement_gradient": 0.6}
        report["observations"] = [{"asset_id": view["asset_id"], "iou": view["observation_iou"]} for view in observed]
        report["original_observations"] = list(report["observations"])
        report["geometry_basis"] = "body_before_manufacturing"
        report["source_sha256"] = {view["asset_id"]: hashlib.sha256(assets.path(view["asset_id"]).read_bytes()).hexdigest() for view in views}
        if not views:
            return OutlineResult(None, report)
        before = np.array([view["before_iou"] for view in views])
        best_scores, vertices = before.copy(), original.copy()
        maximum = np.ptp(original[:, 2]) * ratio
        for iteration in range(iterations):
            check()
            if progress:
                progress(55 + 40 * iteration / iterations, "根据照片轮廓调整自然曲面")
            moves, weights = np.zeros_like(vertices), np.zeros(len(vertices))
            for view in views:
                check()
                pixels, scale, factor, right, up = projection(vertices, view)
                xy = np.clip(np.rint(pixels).astype(np.int32), [0, 0], [383, 319])
                distance = view["sdf"][xy[:, 1], xy[:, 0]]
                gradient = view["gradient"][xy[:, 1], xy[:, 0]]
                boundary = cv2.distanceTransform(raster(vertices, view), cv2.DIST_L2, 5)[xy[:, 1], xy[:, 0]]
                selected = ((boundary <= 3) | (distance < 0)) & (np.linalg.norm(gradient, axis=1) > 0.1)
                delta = -np.clip(distance, -3, 3)[:, None] * gradient / np.maximum(np.linalg.norm(gradient, axis=1)[:, None], 0.1)
                world = (delta[:, 0, None] * right - delta[:, 1, None] * up) / (scale * factor[:, None])
                moves[selected] += world[selected]
                weights[selected] += 1
            moves /= np.maximum(weights[:, None], 1)
            accepted = False
            for step in (1, 0.5, 0.25):
                displacement = smooth_cage(original, vertices + moves * step - original, maximum)
                candidate = original + displacement
                values = np.array([score(candidate, view) for view in views])
                if values.mean() > best_scores.mean() + 0.0005 and np.all(values >= before - 0.025):
                    vertices, best_scores, accepted = candidate, values, True
                    break
            if not accepted:
                break
        report.update(before_iou=float(before.mean()), after_iou=float(best_scores.mean()), views=[{key: view[key] for key in ("asset_id", "yaw_deg", "elevation_deg", "distance_ratio", "before_iou")} for view in views])
        report["view_scores"] = best_scores.tolist()
        report["observations"] = [{"asset_id": view["asset_id"], "iou": score(vertices, view)} for view in observed]
        if best_scores.mean() <= before.mean() + 0.002:
            report.update(after_iou=report["before_iou"], observations=report["original_observations"], view_scores=before.tolist())
            return OutlineResult(None, report)
        report["status"] = "fitted"
        self._views[job.id] = (views, observed)
        return OutlineResult(json.dumps({"vertices": vertices.tolist(), "faces": faces.tolist()}).encode(), report)

    def evaluate(self, source, report):
        # 复核 Blender 闭合后的表面；评价只用于本次同一照片集合。
        vertices, _ = mesh_data(source)
        state = self._views.pop(report.pop("job_id"), None)
        if state is None:
            raise DomainError("缺少本次照片轮廓观测，不能复用其他任务的评价。", "OUTLINE_OBSERVATIONS")
        views, observed = state
        values = [score(vertices, view) for view in views]
        return report | {"after_iou": float(np.mean(values)), "view_scores": values, "observations": [{"asset_id": view["asset_id"], "iou": score(vertices, view)} for view in observed]}

    def discard(self, identifier):
        self._views.pop(identifier, None)
