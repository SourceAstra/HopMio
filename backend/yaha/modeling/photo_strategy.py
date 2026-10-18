"""照片生成按观测能力选策略，不按对象类别选生成器。"""

from ..contracts import DomainError, Mode

PHOTO_MODES = (Mode.IMAGE, Mode.MULTIVIEW)


def select_photo_route(service, spec, automatic):
    if not automatic or spec.mode not in PHOTO_MODES or (spec.modeling_plan and spec.modeling_plan.source_mesh):
        return None
    requested = spec.provider
    scan = service.modelers["reconstruction"].status()
    if spec.photo_policy == "auto":
        spec.provider = "parametric" if len(spec.asset_ids) < scan["min_photos"] else "reconstruction"
    else:
        spec.provider = "parametric" if spec.photo_policy == "parameters" else "reconstruction"
    if spec.provider == "reconstruction":
        if not scan["available"]:
            raise DomainError(scan["message"], "RECONSTRUCTION_UNAVAILABLE")
        if not scan["min_photos"] <= len(spec.asset_ids) <= scan["max_photos"]:
            raise DomainError(f"实物表面重建需要{scan['min_photos']}–{scan['max_photos']}张同一实物的重叠视角照片；单张照片不能确定深度与背面。请补充多视角照片，或主动选择包含推测的照片参考设计。", "RECONSTRUCTION_VIEWS")
    return {"schema_version": "yaha.photo-generation/v1", "policy": spec.photo_policy, "requested_provider": requested, "selected_provider": spec.provider, "attempts": []}


def build_photo_result(spec, route, job, operation):
    try:
        result = operation(spec)
    except DomainError as error:
        if route:
            route["attempts"].append({"provider": spec.provider, "status": "failed", "code": error.code, "message": str(error)[:300]})
            job.record(photo_generation=route)
        raise
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
