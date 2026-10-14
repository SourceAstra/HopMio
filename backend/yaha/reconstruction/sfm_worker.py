"""独立 CPU 相机求解进程，输入只含已校验的照片与配置。"""

import json
import math
import sys
import sqlite3
from contextlib import closing
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps
import pycolmap


def progress(root, percent, stage):
    file = root / "progress.new"
    file.write_text(json.dumps({"percent": percent, "stage": stage}), encoding="utf-8")
    file.replace(root / "progress.json")


def prepare_images(root, plan, config):
    images, masks = root / "images", root / "masks"
    images.mkdir()
    masks.mkdir()
    names = []
    for index, observation in enumerate(plan["observations"]):
        name = f"view_{index:03d}.jpg"
        names.append(name)
        with Image.open(root / f"input_{index:03d}.png") as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((config["max_image_size"], config["max_image_size"]))
            pixels = np.asarray(image)
            image.save(images / name, quality=95)
        height, width = pixels.shape[:2]
        x, y, w, h = observation["region"]
        rect = (max(1, int(x * width)), max(1, int(y * height)), min(width - 2, int(w * width)), min(height - 2, int(h * height)))
        rect = (rect[0], rect[1], min(rect[2], width - rect[0] - 1), min(rect[3], height - rect[1] - 1))
        mask = np.zeros((height, width), dtype=np.uint8)
        cv2.grabCut(pixels, mask, rect, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 3, cv2.GC_INIT_WITH_RECT)
        mask = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8) * 255
        if cv2.countNonZero(mask) < width * height * 0.005:
            raise ValueError("照片" + str(index + 1) + "未提取到足够的主体，请调整主体范围。")
        cv2.imwrite(str(masks / (name + ".png")), mask)
    return images, masks, names


def undistort_masks(root, original, undistorted):
    masks = root / "dense_masks"
    masks.mkdir()
    for image_id, image in undistorted.images.items():
        camera = undistorted.cameras[image.camera_id]
        previous = original.cameras[original.images[image_id].camera_id]
        coefficients = np.asarray(distortion(previous), dtype=np.float64)
        maps = cv2.initUndistortRectifyMap(previous.calibration_matrix(), coefficients, np.eye(3), camera.calibration_matrix(), (camera.width, camera.height), cv2.CV_32FC1)
        mask = cv2.imread(str(root / "masks" / (image.name + ".png")), cv2.IMREAD_GRAYSCALE)
        corrected = cv2.remap(mask, *maps, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        cv2.imwrite(str(masks / (Path(image.name).stem + ".mask.png")), corrected)


def distortion(camera):
    return {"SIMPLE_RADIAL": lambda p: [p[3], 0, 0, 0], "OPENCV": lambda p: p[4:8], "SIMPLE_PINHOLE": lambda p: [0, 0, 0, 0], "PINHOLE": lambda p: [0, 0, 0, 0]}[camera.model.name](camera.params)


def matching_summary(database, names, plan):
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as db:
        image_ids = {identifier: names.index(name) for identifier, name in db.execute("SELECT image_id,name FROM images")}
        features = {image_ids[identifier]: count for identifier, count in db.execute("SELECT image_id,rows FROM keypoints")}
        neighbors = [set() for _ in names]
        pair_count = 0
        for pair_id, count in db.execute("SELECT pair_id,rows FROM two_view_geometries WHERE rows>=15"):
            a, b = (image_ids[identifier] for identifier in pycolmap.pair_id_to_image_pair(pair_id))
            neighbors[a].add(b)
            neighbors[b].add(a)
            pair_count += 1
    remaining, groups = set(range(len(names))), []
    while remaining:
        pending, group = [min(remaining)], []
        while pending:
            index = pending.pop()
            if index not in remaining:
                continue
            remaining.remove(index)
            group.append(index)
            pending.extend(neighbors[index] & remaining)
        groups.append(sorted(group))
    ids = plan["source_asset_ids"]
    return {"schema_version": "yaha.photo-matching/v1", "input_views": len(names), "pair_count": pair_count,
            "connected_views": sum(bool(group) for group in neighbors), "largest_group_views": max(map(len, groups)),
            "groups": [[ids[index] for index in group] for group in groups],
            "isolated_asset_ids": [ids[index] for index, group in enumerate(neighbors) if not group],
            "feature_counts": [{"asset_id": ids[index], "count": features.get(index, 0)} for index in range(len(names))]}


def main(root):
    config, plan = json.loads((root / "config.json").read_text()), json.loads((root / "plan.json").read_text())
    progress(root, 12, "提取每张照片的主体范围")
    images, masks, names = prepare_images(root, plan, config)
    database = root / "features.db"
    progress(root, 20, "提取共同观测的照片特征")
    pycolmap.extract_features(database, images, image_names=names, reader_options={"camera_model": config["camera_model"], "mask_path": masks}, extraction_options={"max_image_size": config["max_image_size"], "num_threads": config["threads"], "use_gpu": False, "sift": {"estimate_affine_shape": config["estimate_affine_shape"], "domain_size_pooling": config["domain_size_pooling"]}}, device=pycolmap.Device.cpu)
    progress(root, 28, "匹配不同角度并检查几何一致性")
    pycolmap.match_exhaustive(database, matching_options={"num_threads": config["threads"], "use_gpu": False, "guided_matching": config["guided_matching"]}, device=pycolmap.Device.cpu)
    matching = matching_summary(database, names, plan)
    (root / "matching.json").write_text(json.dumps(matching), encoding="utf-8")
    required = max(config["min_registered_views"], math.ceil(config["min_registered_ratio"] * len(names))) if config.get("registration_policy", "strict") == "strict" else config["min_registered_views"]
    if matching["largest_group_views"] < required:
        raise ValueError(f"{len(names)}张照片的最大共同视角组只有{matching['largest_group_views']}张，需至少{required}张互相重叠。请补拍相邻角度；照片匹配诊断已保存。")
    progress(root, 35, "求解相机、三维点与重投影误差")
    sparse = root / "sparse"
    sparse.mkdir()
    models = pycolmap.incremental_mapping(database, images, sparse, options={"num_threads": config["threads"], "min_model_size": 3, "random_seed": 0, "max_runtime_seconds": config["timeout_seconds"], "ba_use_gpu": False})
    if not models:
        raise ValueError("照片没有形成可配准的视角组，请增加重叠角度并保持同一造型。")
    eligible = [item for item in models.values() if item.num_reg_images() >= required and item.num_points3D() >= config["min_sparse_points"] and math.isfinite(item.compute_mean_reprojection_error()) and item.compute_mean_reprojection_error() <= config["max_reprojection_error_px"]]
    model = max(eligible or models.values(), key=lambda item: (item.num_reg_images(), item.num_points3D(), -item.compute_mean_reprojection_error()))
    registered, points, error = model.num_reg_images(), model.num_points3D(), model.compute_mean_reprojection_error()
    if not math.isfinite(error):
        raise ValueError("相机配准误差不是有效数值，请增加共同观测。")
    registered_names = {image.name for image in model.images.values()}
    quality = {"schema_version": "yaha.reconstruction-quality/v1", "input_views": len(names), "registered_views": registered, "registration_ratio": registered / len(names), "sparse_points": points, "mean_reprojection_error_px": error,
               "registered_asset_ids": [plan["source_asset_ids"][index] for index, name in enumerate(names) if name in registered_names],
               "unregistered_asset_ids": [plan["source_asset_ids"][index] for index, name in enumerate(names) if name not in registered_names],
               "warnings": ["部分照片尚未配准，仅恢复有效视角共同观测的表面；未观测部位不代表真实还原。"] if registered < len(names) else []}
    if registered / len(names) < config["min_registered_ratio"]:
        quality["warnings"].append("有效视角占比较低，建议补充相邻重叠角度；现有有效观测继续保留。")
    quality["photo_matching"] = matching
    (root / "quality.json").write_text(json.dumps(quality), encoding="utf-8")
    if registered < required or points < config["min_sparse_points"] or error > config["max_reprojection_error_px"]:
        raise ValueError(f"相机配准未通过：{registered}/{len(names)}视角，{points}个三维点，平均误差{error:.2f}px。请补拍或调整主体范围。")
    selected = root / "selected"
    selected.mkdir()
    model.write(selected)
    progress(root, 44, "校正相机畸变并导出已配准视角")
    dense = root / "dense"
    pycolmap.undistort_images(dense, selected, images, num_threads=config["threads"])
    corrected = pycolmap.Reconstruction(dense / "sparse")
    undistort_masks(root, model, corrected)
    corrected.write_text(dense / "sparse")
    for file in (dense / "sparse").glob("*.bin"):
        file.unlink()
    first = next((image for image in corrected.images.values() if image.name == names[0]), None)
    if first is None and plan.get("scale_reference"):
        raise ValueError("标尺参考照片未配准，无法使用该实物距离标定；请补拍标尺视角。")
    if first is None:
        first = min(corrected.images.values(), key=lambda image: names.index(image.name))
        quality["warnings"].append("主参考照片未配准，预览使用已配准照片；原主参考仍保留。")
    first_index = names.index(first.name)
    quality["reference_asset_id"] = plan["source_asset_ids"][first_index]
    (root / "quality.json").write_text(json.dumps(quality), encoding="utf-8")
    camera, pose = corrected.cameras[first.camera_id], first.cam_from_world()
    views = []
    for image in corrected.images.values():
        view_camera, view_pose = corrected.cameras[image.camera_id], image.cam_from_world()
        views.append({"asset_id": plan["source_asset_ids"][names.index(image.name)], "name": image.name, "width": view_camera.width, "height": view_camera.height, "K": view_camera.calibration_matrix().tolist(), "rotation": view_pose.rotation.matrix().tolist(), "translation": np.asarray(view_pose.translation).reshape(3).tolist(), "center": np.asarray(image.projection_center()).reshape(3).tolist()})
    data = {"asset_id": plan["source_asset_ids"][first_index], "name": first.name, "width": camera.width, "height": camera.height, "K": camera.calibration_matrix().tolist(), "rotation": pose.rotation.matrix().tolist(), "translation": np.asarray(pose.translation).reshape(3).tolist(), "views": views}
    if plan.get("scale_reference"):
        previous = model.cameras[model.images[first.image_id].camera_id]
        reference = plan["scale_reference"]
        pixels = np.asarray(reference["points"], dtype=np.float64).reshape(2, 1, 2) * [previous.width, previous.height]
        corrected_points = cv2.undistortPoints(pixels, previous.calibration_matrix(), np.asarray(distortion(previous), dtype=np.float64), P=camera.calibration_matrix())
        data["scale_reference"] = {"points_px": corrected_points.reshape(2, 2).tolist(), "distance_mm": reference["distance_mm"]}
    (root / "camera.json").write_text(json.dumps(data), encoding="utf-8")
    progress(root, 46, "相机求解完成")


if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve()
    try:
        main(root)
    except Exception as error:
        (root / "error.json").write_text(json.dumps({"message": str(error)[:600]}), encoding="utf-8")
        raise
