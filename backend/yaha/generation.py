"""生成统一走受控 Blender；复测通过后提交新版本。"""

import json
from .contracts import DesignSpec, DomainError, Mode
from .modeling.building import build_with_correction
from .modeling.adjusting import adjust_plan
from .modeling.planner import current_plan, design_plan
from .modeling.reviewing import refine_shape
from .modeling.photo_strategy import select_photo_route, build_photo_result
from .modeling.photo_quality import photo_completion
from .modeling.design_review import review_design, require_adjustment_acceptance
from .modeling.geometry_review import review_geometry


def start_generation(service, identifier, data, repair=False, *, adjustment=None, auto_photo=False):
    spec = DesignSpec.model_validate(data)
    if spec.mode == Mode.TEXT and spec.asset_ids and (auto_photo or spec.provider == "parametric"):
        spec.mode = Mode.MULTIVIEW if len(spec.asset_ids) > 1 else Mode.IMAGE
    route = select_photo_route(service, spec, auto_photo and not repair and not adjustment)
    project = service.projects.get(identifier)
    parent = project["revision_id"]
    previous_adjustment = (project["model"] or {}).get("adjustment") if not repair and spec.provider == "parametric" and current_plan(spec) else None
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
        if source.provider == "parametric" and source.mode in (Mode.TEXT, Mode.IMAGE, Mode.MULTIVIEW):
            if photo_shape and not source.asset_ids:
                raise DomainError("先上传一张参考照片。", "PHOTO_REQUIRED")
            if not current_plan(source) or (not adjustment_result and source.modeling_plan.schema_version < 5):
                design_plan(service, source, job)
        # 优化 B（微调路径纯粹化）：明确区分“照片一键建模全景审阅”与“用户意图局部微调”。
        # 用户微调已有明确主观修改意图，直通物理制造定标，避免拉入全量原图进行严苛比对与长达数分钟的重构循环。
        review = photo_shape and not repair and not adjustment_result
        result_spec = source
        result = build_with_correction(service, source, job, repair=repair, progress_range=(10, 55) if review else None, review_views=bool(review or adjustment_result or source.provider == "parametric"), fit_photos=not adjustment_result, adjustment_intent=(adjustment_result or {}).get("instruction"))
        if review:
            result_spec, result = refine_shape(service, source, result, job, adjustment=adjustment_result)
        elif source.provider == "parametric" and not repair:
            if service.settings.public()["chat_supports_images"]:
                result_spec, result = review_design(service, source, result, project, job, adjustment=adjustment_result)
            else:
                result_spec, result = review_geometry(service, source, result, project, job, adjustment=adjustment_result, require_change=bool(adjustment))
            if adjustment_result:
                require_adjustment_acceptance(result[0].manifest["design_review"])
        return result_spec, result

    def work(job):
        job.progress(1, "准备建模材料")
        adjustment_result = adjust_plan(service, spec, adjustment, project, job) if adjustment else previous_adjustment
        result_spec, result = build_photo_result(spec, route, job, lambda source: build(source, job, adjustment_result))
        built, mesh, measurements = result
        if adjustment_result:
            built.manifest["adjustment"] = adjustment_result
        review = built.manifest.get("design_review") or built.manifest.get("photo_review")
        completion = photo_completion(review)
        draft = completion["status"] == "draft"
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
                    asset = service.assets.write(content, extension, "作品" + extension, "model-preview" if role in ("comparison", "reference") else "model", units=built.manifest.get("units", {}).get(role, "m" if extension in (".glb", ".blend") else "mm"))
                    saved.append(asset["id"])
                    ids[role + "_id"] = asset["id"]
                manifest = service.assets.write(json.dumps(built.manifest, ensure_ascii=False).encode(), ".json", "建模清单.json", "manifest")
                saved.append(manifest["id"])
                model = ids | {
                    "manifest_id": manifest["id"], "source_stl_id": ids["stl_id"],
                    "size_mm": mesh.extents.round(3).tolist(), "faces": len(mesh.faces),
                    "volume_mm3": round(abs(mesh.volume), 3), "preview_units": "m",
                    "measurements": measurements,
                    "precision_status": "verified" if measurements else "unverified",
                    "origin": "Blender 网格修复" if repair else "照片参考造型 · Blender" if spec.provider == "parametric" and spec.asset_ids else {"parametric": "AI 参数 · Blender", "reconstruction": "照片表面重建 · Blender", "local": "本地模板 · Blender"}[spec.provider],
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
                return job.commit(lambda: {"project": service.projects.revision(identifier, result_spec.model_dump(), model, "待改进草稿" if draft else "AI 细节调整" if adjustment else "Blender 修复" if repair else "Blender 建模"), "completion": completion})
            except Exception:
                for asset_id in reversed(saved):
                    service.assets.remove(asset_id)
                raise

    metadata = {"spec": spec.model_dump(), "base_revision_id": parent}
    if adjustment:
        metadata["adjustment"] = adjustment.model_dump()
    return service.jobs.start("adjust" if adjustment else "repair" if repair else "generate", identifier, work, metadata)
