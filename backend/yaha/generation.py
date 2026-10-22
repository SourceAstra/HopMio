"""生成统一走受控 Blender；复测通过后提交新版本。"""

import json
import uuid
from .contracts import DesignSpec, DomainError, Mode
from .modeling.building import build_with_correction
from .modeling.adjusting import adjust_plan, validate_scope
from .modeling.planner import current_plan, design_plan
from .modeling.reviewing import refine_shape
from .modeling.photo_strategy import select_photo_route, build_photo_result
from .modeling.photo_quality import photo_completion
from .modeling.design_review import review_design, adjustment_accepted
from .modeling.geometry_review import review_geometry
from .modeling.mesh_editing import editable_spec, require_source


def start_generation(service, identifier, data, repair=False, *, adjustment=None, auto_photo=False, build_operation=None, reason=None, preview_only=False):
    spec = DesignSpec.model_validate(data)
    if spec.modeling_plan and spec.modeling_plan.generator and not repair and not adjustment and build_operation is None:
        from .modeling.parameters import build_direct
        build_operation = build_direct
    project = service.projects.get(identifier)
    if spec.modeling_plan and not spec.modeling_plan.source_mesh and not spec.modeling_plan.source_options:
        from .modeling.contracts import PlanOptions
        old = project["spec"]
        spec.modeling_plan.source_options = PlanOptions(base=bool(old.get("base")), hole=bool(old.get("hole")), hole_shape=old.get("hole_shape", "round"))
    if adjustment:
        previous_plan = DesignSpec.model_validate(project["spec"]).modeling_plan
        if (previous_plan and previous_plan.generator) or (spec.modeling_plan and spec.modeling_plan.generator):
            # AI 局部编辑以当前已保存制造网格为准；注册生成器及其参数留在旧版本。
            spec = DesignSpec.model_validate(project["spec"])
            spec.modeling_plan = None
        spec = editable_spec(spec, project, service.assets)
        if previous_plan:
            require_source(previous_plan, spec.modeling_plan)
    if spec.mode in (Mode.RELIEF, Mode.SILHOUETTE) and not (spec.modeling_plan and spec.modeling_plan.source_mesh):
        spec.provider = "local"
        spec.modeling_plan = None
    elif spec.mode == Mode.TEXT and spec.asset_ids and (auto_photo or spec.provider == "parametric"):
        spec.mode = Mode.MULTIVIEW if len(spec.asset_ids) > 1 else Mode.IMAGE
    route = select_photo_route(service, spec, auto_photo and not repair and not adjustment)
    parent = project["revision_id"]
    previous_adjustment = (project["model"] or {}).get("adjustment") if not build_operation and not repair and spec.provider == "parametric" and current_plan(spec) else None
    if adjustment and (repair or spec.provider != "parametric" or not spec.modeling_plan or not project["model"]):
        raise DomainError("先生成参考造型，再用 AI 调整细节。", "AI_ADJUSTMENT_REQUIRES_PLAN")
    if adjustment and not service.editor:
        raise DomainError("当前建模服务未提供 AI 细节调整。", "AI_ADJUSTMENT_UNAVAILABLE")
    if repair:
        if not project["model"]:
            raise DomainError("还没有模型可以修复。")
        spec = spec.model_copy(update={"mode": Mode.IMPORT, "provider": "local", "modeling_plan": None, "reconstruction_plan": None, "asset_ids": [project["model"]["stl_id"]]})
    modeler = service.modelers[spec.provider]
    if not modeler.status()["available"]:
        raise DomainError(modeler.status()["message"], "MODELER_UNAVAILABLE")

    def build(source, job, adjustment_result):
        photo_shape = source.provider == "parametric" and source.mode in (Mode.IMAGE, Mode.MULTIVIEW)
        if source.provider == "parametric" and (source.modeling_plan and source.modeling_plan.source_mesh or source.mode in (Mode.TEXT, Mode.IMAGE, Mode.MULTIVIEW)):
            if photo_shape and not source.asset_ids and not (source.modeling_plan and source.modeling_plan.source_mesh):
                raise DomainError("先上传一张参考照片。", "PHOTO_REQUIRED")
            if not current_plan(source) or (not adjustment_result and source.modeling_plan.schema_version < 5):
                design_plan(service, source, job)
        # 首次照片造型检查轮廓观测；微调由成品审阅同时对照原照片、前后网格与修改意图。
        review = photo_shape and not repair and not adjustment_result and not (source.modeling_plan and source.modeling_plan.source_mesh)
        result_spec = source
        result = build_with_correction(service, source, job, repair=repair, progress_range=(10, 55) if review else None, review_views=bool(review or adjustment_result or source.provider == "parametric"), fit_photos=not adjustment_result, adjustment_intent=(adjustment_result or {}).get("instruction"))
        if review:
            result_spec, result = refine_shape(service, source, result, job, adjustment=adjustment_result)
        elif source.provider == "parametric" and not repair:
            if service.settings.public()["chat_supports_images"]:
                result_spec, result = review_design(service, source, result, project, job, adjustment=adjustment_result)
            else:
                result_spec, result = review_geometry(service, source, result, project, job, adjustment=adjustment_result, require_change=bool(adjustment))
        return result_spec, result

    def work(job):
        job.progress(1, "准备建模材料")
        scope_baseline = spec.modeling_plan.model_copy(deep=True) if adjustment and spec.modeling_plan else None
        adjustment_result = adjust_plan(service, spec, adjustment, project, job) if adjustment else previous_adjustment
        operation = (lambda source: build_operation(service, source, project, job)) if build_operation else (lambda source: build(source, job, adjustment_result))
        result_spec, result = build_photo_result(spec, route, job, operation)
        if scope_baseline:
            validate_scope(scope_baseline, result_spec.modeling_plan, adjustment.target_part_id)
        built, mesh, measurements = result
        if adjustment_result:
            built.manifest["adjustment"] = adjustment_result
        review = built.manifest.get("design_review") or built.manifest.get("photo_review")
        completion = photo_completion(review, built.manifest.get("photo_fidelity"))
        draft = completion["status"] == "draft"
        if adjustment_result and not adjustment_accepted(review or {}):
            draft = True
            completion = {"status": "draft", "message": "微调候选已保存，尚未通过审阅；当前模型保留，可在版本记录中查看或重试。"}
        if preview_only:
            draft = True
            completion = {"status": "draft", "message": "脚本候选已保存，请查看预览后采用。"}
        job.progress(92, "保存待改进草稿与审阅依据" if draft else "保存已复测的模型与源工程")
        with service.lock:
            job.check()
            if service.projects.get(identifier)["revision_id"] != parent:
                raise DomainError("作品已经切换版本，本次结果未覆盖当前模型。", "REVISION_CHANGED")
            saved = []
            try:
                ids = {}
                for role, content in built.files.items():
                    descriptor = built.manifest["outputs"].get(role, {})
                    extension = descriptor.get("extension", "." + role)
                    kind = "model-preview" if extension in (".png", ".jpg", ".jpeg", ".webp") else "model"
                    asset = service.assets.write(content, extension, "作品" + extension, kind, units=built.manifest.get("units", {}).get(role, "m" if extension in (".glb", ".blend") else "mm"))
                    saved.append(asset["id"])
                    ids[role + "_id"] = asset["id"]
                manifest = service.assets.write(json.dumps(built.manifest, ensure_ascii=False).encode(), ".json", "建模清单.json", "manifest")
                saved.append(manifest["id"])
                model = ids | {
                    "manifest_id": manifest["id"], "source_stl_id": ids["stl_id"],
                    "size_mm": mesh.extents.round(3).tolist(), "faces": len(mesh.faces),
                    "volume_mm3": round(abs(mesh.volume), 3), "preview_units": "m",
                    "measurements": measurements,
                    "precision_status": "verified" if measurements and all(item["status"] == "pass" for item in measurements) else "unverified",
                    "origin": built.manifest.get("origin") or ("Blender 网格修复" if repair else "照片参考造型 · Blender" if spec.provider == "parametric" and spec.asset_ids else {"parametric": "AI 参数 · Blender", "reconstruction": "照片表面重建 · Blender", "local": "本地模板 · Blender"}[spec.provider]),
                }
                if built.manifest.get("reconstruction"):
                    model["reconstruction"] = built.manifest["reconstruction"]
                if built.manifest.get("photo_review"):
                    model["photo_review"] = built.manifest["photo_review"]
                if built.manifest.get("design_review"):
                    model["design_review"] = built.manifest["design_review"]
                if built.manifest.get("outline_fit"):
                    model["outline_fit"] = built.manifest["outline_fit"]
                if built.manifest.get("photo_fidelity"):
                    model["photo_fidelity"] = built.manifest["photo_fidelity"]
                if adjustment_result:
                    model["adjustment"] = adjustment_result
                if built.manifest.get("script_document"):
                    document = service.assets.write(json.dumps(built.manifest["script_document"], ensure_ascii=False).encode(), ".json", "生成脚本.json", "model-script")
                    saved.append(document["id"])
                    model["script_document_id"] = document["id"]
                    result_spec.asset_ids = [ids["stl_id"]]
                if result_spec.modeling_plan and result_spec.modeling_plan.source_mesh:
                    model["origin"] = "原网格编辑 · Blender"
                    original = project.get("model") or {}
                    for key in ("source_glb_id", "reference_id", "reconstruction", "photo_fidelity"):
                        if key in original:
                            model[key] = original[key]
                    if model.get("photo_fidelity"):
                        model["photo_fidelity"] = model["photo_fidelity"] | {"edited": True, "appearance_status": "unverified", "warnings": list(model["photo_fidelity"].get("warnings", [])) + ["当前为原网格的编辑版本；源照片与观测报告仅供溯源，不证明编辑后与实物相同。"]}
                def save_revision():
                    candidate = str(uuid.uuid4())
                    updated = service.projects.revision(identifier, result_spec.model_dump(), model, reason if preview_only else "待改进草稿" if draft else reason or ("AI 细节调整" if adjustment else "Blender 修复" if repair else "Blender 建模"), activate=not preview_only and (not draft or not project.get("model")), revision_identifier=candidate)
                    return {"project": updated, "candidate_revision_id": candidate, "applied": not draft, "completion": completion}
                return job.commit(save_revision)
            except Exception:
                for asset_id in reversed(saved):
                    service.assets.remove(asset_id)
                raise

    metadata = {"spec": spec.model_dump(), "base_revision_id": parent}
    if preview_only:
        metadata["preview_only"] = True
    if adjustment:
        metadata["adjustment"] = adjustment.model_dump()
    return service.jobs.start("adjust" if adjustment else "repair" if repair else "generate", identifier, work, metadata)
