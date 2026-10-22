"""观测门禁只使用全部可靠分割，不将拟合改善当作外观通过。"""

import math


def photo_completion(review, fidelity=None):
    if review and review.get("status") == "geometry_verified" and review.get("scope") == "geometry_only":
        return {"status": "completed", "message": review["message"]}
    if fidelity and fidelity.get("status") == "observed_surface" and fidelity.get("appearance_status") != "accepted":
        return {"status": "draft", "message": "待改进草稿已保存，真实扫描表面尚未通过照片外观验收。"}
    if not review:
        return {"status": "completed", "message": "作品做好啦！"}
    state = "draft" if review["status"] != "accepted" else review["scope"]
    messages = {
        "draft": "待改进草稿已保存，成品造型未通过审阅。" if review.get("schema_version") == "yaha.design-review/v1" else "待改进草稿已保存，照片外观未通过验收。",
        "design_intent": "模型已生成并通过造型意图审阅。",
        "photo_reference": "模型已生成并通过照片外观审阅。",
    }
    return {"status": "draft" if state == "draft" else "completed", "message": messages[state]}


def outline_quality(manifest, policy, *, intentional=False):
    outline = manifest.get("outline_fit", {})
    observations = outline.get("observations", [])
    values = [item["iou"] for item in observations if isinstance(item.get("iou"), (int, float)) and math.isfinite(item["iou"]) and 0 <= item["iou"] <= 1]
    expected = outline.get("full_object_views", outline.get("input_views", 0))
    ratio = len(values) / expected if expected else 0
    mean = sum(values) / len(values) if values else None
    low = [item["asset_id"] for item in observations if isinstance(item.get("iou"), (int, float)) and item["iou"] < policy["min_view_iou"]]
    status = "intentional" if intentional else "unverified" if not values or ratio < policy["min_observed_ratio"] else "revise" if mean < policy["min_mean_iou"] or low else "pass"
    return {"status": status, "camera_status": "estimated", "observed_views": len(values), "expected_views": expected, "observed_ratio": ratio, "mean_iou": mean, "low_match_asset_ids": low, "observations": observations, "skipped": outline.get("skipped", []), "thresholds": {key: policy[key] for key in ("min_mean_iou", "min_view_iou", "min_observed_ratio")}}
