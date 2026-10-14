"""只测量照片，不根据对象类别生成形体。"""

import hashlib
from typing import Protocol
import cv2
import numpy as np
from PIL import Image
from .contracts import PhotoObservation, ReconstructionPlan
from .runtime import configuration
from ..contracts import DomainError


class PhotoObserver(Protocol):
    def inspect(self, path, asset_id: str, config: dict) -> PhotoObservation: ...


class OpenCVPhotoObserver:
    def inspect(self, path, asset_id, config):
        with Image.open(path) as image:
            width, height = image.size
            image.thumbnail((1000, 1000))
            gray = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2GRAY)
        blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        points = cv2.SIFT_create(nfeatures=2000).detect(gray, None)
        warnings = []
        if blur < config["min_blur_score"]:
            warnings.append("照片偏模糊，建议换成清晰照片。")
        if len(points) < config["min_features"]:
            warnings.append("纹理特征较少，建议增加角度、改善光照或补充近照。")
        return PhotoObservation(asset_id=asset_id, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), width_px=width, height_px=height, blur_score=round(blur, 2), feature_count=len(points), warnings=warnings)


def design(spec, assets, job, observer: PhotoObserver | None = None, *, progress_range=(10, 80)):
    config = configuration()
    if not spec.asset_ids or len(spec.asset_ids) > config["max_photos"]:
        raise DomainError("请选择1–" + str(config["max_photos"]) + "张同一造型的照片。", "RECONSTRUCTION_PHOTOS")
    observer = observer or OpenCVPhotoObserver()
    observations, total = [], 0
    for index, asset_id in enumerate(spec.asset_ids):
        job.check()
        asset = assets.db.get("assets", asset_id)
        if not asset or asset["kind"] != "image":
            raise DomainError("表面重建只接受照片，请移除模型文件。", "RECONSTRUCTION_PHOTOS")
        total += asset["bytes"]
        if total > config["max_input_mb"] * 1024 * 1024:
            raise DomainError("照片集合超过配置的大小预算，请减少数量或压缩照片。", "RECONSTRUCTION_BUDGET")
        start, end = progress_range
        job.progress(start + (end - start) * (index + 1) / len(spec.asset_ids), "检查照片：" + str(index + 1) + "/" + str(len(spec.asset_ids)))
        observation = observer.inspect(assets.path(asset_id), asset_id, config)
        previous = next((item for item in (spec.reconstruction_plan.observations if spec.reconstruction_plan else []) if item.asset_id == asset_id and item.sha256 == observation.sha256), None)
        if previous:
            observation.region = previous.region
        observations.append(observation)
    if len({item.sha256 for item in observations}) != len(observations):
        raise DomainError("存在重复照片，请选择不同角度。", "RECONSTRUCTION_DUPLICATE")
    values = {"height": (spec.height_mm, "作品总高", "mm"), "voxel": (config["voxel_mm"], "制造修补精度", "mm"), "rotate_x": (0, "前后倾斜", "deg"), "rotate_y": (0, "左右倾斜", "deg"), "rotate_z": (0, "转动方向", "deg"), "base_h": (4 if spec.base else 0, "底座厚度", "mm"), "base_margin": (3, "底座余量", "mm"), "scale_ratio": (1, "实物标定后的打印比例", "ratio")}
    assumptions = ["多角度照片用于恢复共同观测的表面；单张照片只能用于检查和外观参考。", "照片中的人物或物品必须保持同一造型；移动、反光、透明和低纹理区域可能缺损。", "按作品总高等比制作；实际宽深由原始造型决定。", "制造副本通过体素修补闭合，原始扫描表面单独保留；修补区域不是实测表面。"]
    parameters = {key: {"value": value, "label": label, "unit": unit} for key, (value, label, unit) in values.items()}
    reference = None
    if spec.reconstruction_plan:
        parameters = spec.reconstruction_plan.parameters
        reference = spec.reconstruction_plan.scale_reference
        if reference and reference.asset_id != spec.asset_ids[0]:
            reference = None
    return ReconstructionPlan(source_prompt=spec.prompt, source_asset_ids=spec.asset_ids, observations=observations, parameters=parameters, scale_reference=reference, assumptions=assumptions)
