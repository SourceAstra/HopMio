"""受控执行与制造网格复测共用同一产物，供生成和照片细化复用。"""

import json
import tempfile
from pathlib import Path
from .preparing import prepare
from .measurement import verify
from .compiler import compile_plan
from .contracts import Reference, Expression
from .preview import draft_preview
from .runtime import ROOT
from ..contracts import DomainError, Mode


def parameter_names(value):
    if isinstance(value, Reference):
        return {value.parameter}
    if isinstance(value, Expression):
        return set().union(*(parameter_names(arg) for arg in value.args))
    return set()


def build_with_correction(service, spec, job, **options):
    try:
        return build_model(service, spec, job, **options)
    except DomainError as error:
        if spec.provider != "parametric" or spec.mode != Mode.TEXT or options.get("repair") or options.get("review_views") or error.code not in ("BLENDER_GEOMETRY", "BLENDER_DIMENSION"):
            raise
        from .planner import design_plan
        correction = {"error": str(error), "plan": json.dumps(spec.modeling_plan.model_dump(), ensure_ascii=False)}
        job.record(modeling_correction={"attempt": 1, "code": error.code, "message": str(error), "plan": spec.modeling_plan.model_dump()})
        job.progress(5, "根据实际网格复测修正部件连接与尺寸")
        job.check()
        design_plan(service, spec, job, correction=correction)
        return build_model(service, spec, job, **options)


def build_model(service, spec, job, *, repair=False, progress_range=None, review_views=False, fit_photos=True, deadline=None):
    request, inputs, plan = prepare(spec, service.assets, repair, job=job, observer=service.photo_observer)
    if plan:
        request["source_plan"] = plan.model_dump()
    if progress_range:
        request["progress_range"] = progress_range
    request["preview_views"] = review_views
    if deadline is not None:
        request["deadline"] = deadline
    surface = plan.surface if spec.provider == "parametric" and plan else None
    global_parameters = parameter_names(surface.height_mm) | parameter_names(surface.voxel_mm) if surface else set()
    fitting = bool(fit_photos and surface and spec.asset_ids and not any(p.locked and name not in global_parameters for name, p in plan.parameters.items()))
    request["capture_body"] = fitting
    low, high = progress_range or (10, 90)
    if fitting:
        request["progress_range"] = (low, low + (high - low) * 0.4)
    job.check()
    job.progress(progress_range[0] if progress_range else 10, "准备 Blender 建模参数")
    built = service.modelers[spec.provider].build(request, inputs, job)
    result = measure(built, request, job)
    if fitting and "body" in built.private_files:
        result = fit_outline(service, spec, request, result, job, low, high, deadline=deadline)
    return result


def measure(built, request, job):
    staging = ROOT / ".artifacts/measurement-jobs"
    staging.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=staging) as directory:
        path = Path(directory) / "model.stl"
        path.write_bytes(built.files["stl"])
        def observe(value):
            built.manifest["geometry_check"] = value
            job.record(geometry=value)
        mesh, measurements = verify(path, built.manifest, built.manifest.get("constraints", request.get("plan", {}).get("constraints", [])), observe)
    built.manifest["measurements"] = measurements
    return built, mesh, measurements


def fit_outline(service, spec, request, result, job, low, high, *, deadline=None):
    built, mesh, _ = result
    report = {"status": "unchanged"}
    with draft_preview(service, built, mesh, job):
        try:
            progress = lambda value, stage: job.progress(low + (high - low) * (0.4 + value * 0.002), stage)
            fitted = service.outline_fitter.fit(spec, built.private_files["body"], service.assets, job, progress, **({"deadline": deadline} if deadline is not None else {}))
            report = fitted.report
            if fitted.mesh:
                compiled = compile_plan(spec.modeling_plan)
                payload = request | {"plan": compiled | {"steps": []}, "preserve_topology": True, "progress_range": (low + (high - low) * 0.65, high), "reference_shift_m": built.manifest["export_shift_m"]}
                candidate = service.modelers[spec.provider].build(payload, {"input.json": fitted.mesh, "reference.blend": built.files["blend"]}, job)
                candidate_result = measure(candidate, payload, job)
                evaluated = service.outline_fitter.evaluate(candidate.private_files["body"], report | {"job_id": job.id})
                if evaluated["after_iou"] > report["before_iou"] + 0.002 and all(after >= before["before_iou"] - 0.025 for after, before in zip(evaluated["view_scores"], report["views"])):
                    result, report = candidate_result, evaluated
                else:
                    report = report | {"status": "unchanged", "after_iou": report["before_iou"], "observations": report["original_observations"], "message": "闭合后未保留轮廓改善，使用原有造型。"}
        except DomainError as error:
            if error.code == "CANCELED":
                raise
            report = {"status": "draft_retained", "message": str(error)}
        finally:
            service.outline_fitter.discard(job.id)
    result[0].manifest["outline_fit"] = report
    job.record(outline_fit=report, geometry=result[0].manifest["geometry_check"])
    return result
