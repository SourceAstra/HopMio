"""照片生成按观测能力选策略，不按对象类别选生成器。"""

from ..contracts import DomainError, Mode
from .planner import current_plan

PHOTO_MODES = (Mode.IMAGE, Mode.MULTIVIEW)
RECOVERABLE = {"RECONSTRUCTION_FAILED", "RECONSTRUCTION_SURFACE", "RECONSTRUCTION_OUTPUT", "BLENDER_GEOMETRY", "BLENDER_DIMENSION"}


def select_photo_route(service, spec, automatic):
    if not automatic or spec.mode not in PHOTO_MODES:
        return None
    scan = service.modelers["reconstruction"].status()
    keep_plan = current_plan(spec)
    requested = spec.provider
    preferred = {"parameters": "parametric", "surface": "reconstruction"}.get(spec.photo_policy)
    spec.provider = preferred or ("parametric" if keep_plan or not scan["available"] or len(spec.asset_ids) < scan["min_photos"] else "reconstruction")
    return {"schema_version": "yaha.photo-generation/v1", "policy": spec.photo_policy, "requested_provider": requested, "selected_provider": spec.provider, "attempts": []}


def build_photo_result(spec, route, job, operation):
    try:
        result = operation(spec)
    except DomainError as error:
        if not route or route["policy"] != "auto" or spec.provider != "reconstruction" or error.code not in RECOVERABLE:
            raise
        route["attempts"].append({"provider": "reconstruction", "status": "failed", "code": error.code, "message": str(error)[:300]})
        job.record(photo_generation=route)
        job.check()
        job.progress(2, "观测不足以完成表面恢复，生成明确标注的轮廓草稿")
        fallback = spec.model_copy(deep=True, update={"provider": "parametric"})
        result = operation(fallback)
    resolved, (built, _, _) = result
    if route:
        route["selected_provider"] = resolved.provider
        route["attempts"].append({"provider": resolved.provider, "status": "succeeded"})
        job.record(photo_generation=route)
    if resolved.mode in PHOTO_MODES:
        report = photo_fidelity(resolved, built.manifest, route)
        built.manifest["photo_fidelity"] = report
        job.record(photo_fidelity=report)
    return result


def photo_fidelity(spec, manifest, route):
    scan, outline = manifest.get("reconstruction"), manifest.get("outline_fit", {})
    review = manifest.get("photo_review", {})
    warnings = list(scan.get("warnings", [])) if scan else ["这是照片参考造型；未观测的深度、背面与细节包含设计推测。"]
    if route and any(item["status"] == "failed" for item in route["attempts"]):
        warnings.append("本次真实表面恢复未完成，已保留轮廓草稿；该草稿不是实物扫描。")
    if not scan and review.get("status") != "accepted":
        warnings.append(review.get("message") or "该历史版本没有可追溯的照片外观验收，不能确认造型准确。")
    return {"schema_version": "yaha.photo-fidelity/v1", "basis": "calibrated_views" if scan else "estimated_views" if outline.get("used_views") else "photo_reference",
            "appearance_status": "accepted" if review.get("status") == "accepted" else "unverified", "review_scope": review.get("scope"),
            "status": "observed_surface" if scan else "outline_draft", "input_views": len(spec.asset_ids),
            "used_views": scan["registered_views"] if scan else outline.get("used_views", 0),
            "unregistered_asset_ids": scan.get("unregistered_asset_ids", []) if scan else [],
            "reprojection_error_px": scan["mean_reprojection_error_px"] if scan else None,
            "silhouette_iou": outline.get("after_iou") if outline.get("status") == "fitted" else outline.get("before_iou"),
            "textured_surface_ratio": scan.get("textured_surface_ratio") if scan else None,
            "warnings": warnings + (["制造闭合与孔洞修补不代表缺失表面已被观测。"] if scan else [])}
