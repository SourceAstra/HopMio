"""审阅最终网格，有限次修订后再次验收；未验收的结果只保存为草稿。"""

import hashlib
import json
import time
from .building import build_model, parameter_names
from .compiler import compile_plan
from .references import reference_images
from .preview import draft_preview
from .runtime import photo_review_policy
from .photo_quality import outline_quality
from ..contracts import DomainError


def refine_shape(service, spec, result, job, *, adjustment=None):
    policy = photo_review_policy()
    deadline = time.monotonic() + policy["timeout_seconds"]
    intent = (adjustment or {}).get("instruction")
    surface = spec.modeling_plan.surface
    global_parameters = parameter_names(surface.height_mm) | parameter_names(surface.voxel_mm) if surface else set()
    intentional = bool(intent or any(parameter.locked and name not in global_parameters for name, parameter in spec.modeling_plan.parameters.items()))
    review = {"schema_version": "yaha.photo-review/v2", "status": "draft_retained", "scope": "design_intent" if intentional else "photo_reference", "input_views": len(spec.asset_ids), "passes": 0, "revisions": 0, "evidence": [], "message": "照片外观尚未通过审阅。"}
    images, feedback, fingerprints = None, {}, None
    for attempt in range(policy["max_revisions"] + 1):
        built, mesh, _ = result
        review.pop("findings", None)
        review.pop("outline", None)
        try:
            job.check()
            if time.monotonic() >= deadline:
                raise DomainError("照片审阅超过整体预算，已停止自动修订。", "PHOTO_REVIEW_TIMEOUT")
            if not service.assessor or "comparison" not in built.files:
                raise DomainError(built.manifest.get("review_render_error") or "缺少照片审阅服务或实际模型三视图，不能确认外观。", "PHOTO_REVIEW_UNAVAILABLE")
            with draft_preview(service, built, mesh, job):
                job.progress(58, f"对照实际模型审阅外形（第{attempt + 1}轮）")
                images = images if images is not None else reference_images(spec, service.assets)
                if fingerprints is None:
                    fingerprints = {}
                    for identifier in spec.asset_ids:
                        job.check()
                        fingerprints[identifier] = hashlib.sha256(service.assets.path(identifier).read_bytes()).hexdigest()
                outline = outline_quality(built.manifest, policy, intentional=intentional)

                def observe_assess(value):
                    job.check()
                    phase = value.get("phase")
                    elapsed = value.get("elapsed_seconds", 0)
                    chars = value.get("text_chars", 0)
                    stages = {
                        "connecting": f"审阅外形（第{attempt + 1}轮）：连接 AI 审阅服务…",
                        "waiting": f"审阅外形（第{attempt + 1}轮）：多模态比对照片与模型三视图…",
                        "thinking": f"审阅外形（第{attempt + 1}轮）：AI 深度比对中（思考 {elapsed}s）",
                        "content": f"审阅外形（第{attempt + 1}轮）：输出外观审阅依据（{chars} 字）",
                        "validating": f"审阅外形（第{attempt + 1}轮）：校验审阅依据与各视角匹配",
                    }
                    job.record(ai_diagnostics=value, message=stages.get(phase, f"对照实际模型审阅外形（第{attempt + 1}轮）"))

                assessment = service.assessor.assess(spec, images, built.files["comparison"], observe_assess, feedback=outline, adjustment=intent, deadline=deadline)
                findings = assessment.model_dump(exclude={"schema_version"})
                accepted = all(item["status"] == "pass" for item in findings.values()) and outline["status"] in ("pass", "intentional")
                snapshot = {"pass": attempt + 1, "stl_sha256": hashlib.sha256(built.files["stl"]).hexdigest(), "glb_sha256": hashlib.sha256(built.files["glb"]).hexdigest(), "comparison_sha256": hashlib.sha256(built.files["comparison"]).hexdigest(), "plan_sha256": hashlib.sha256(json.dumps(compile_plan(spec.modeling_plan), sort_keys=True).encode()).hexdigest(), "build_plan_digest": built.manifest.get("plan_digest"), "findings": findings, "outline": outline, "accepted": accepted}
                review["evidence"].append(snapshot)
                review.update(passes=review["passes"] + 1, findings=findings, outline=outline)
                job.record(photo_modeling_review=review)
                if accepted:
                    review.update(status="accepted", message="实际模型已通过造型意图审阅；包含有意偏离照片的设计。" if intentional else "实际模型已通过照片外观审阅；估计视角不代表实物精确还原。")
                    break
                review["message"] = "实际外形仍有差异或观测依据不足，保留待改进草稿。"
                if attempt == policy["max_revisions"] or not service.reviewer:
                    break
                if outline["status"] == "unverified" and not any(item["status"] == "revise" for item in findings.values()):
                    review["message"] = "轮廓观测不足且没有可确认的修订依据，保留待改进草稿。"
                    break
                feedback = feedback | {"assessment": findings, "outline": outline}
                candidate = spec.model_copy(deep=True)
                review["revisions"] += 1
                job.progress(60, f"根据审阅意见修订几何方案（第{attempt + 1}轮）")

                def observe_refine(value):
                    job.check()
                    phase = value.get("phase")
                    elapsed = value.get("elapsed_seconds", 0)
                    chars = value.get("text_chars", 0)
                    stages = {
                        "connecting": f"修订方案（第{attempt + 1}轮）：连接 AI 建模服务…",
                        "waiting": f"修订方案（第{attempt + 1}轮）：载入审阅反馈并准备推演…",
                        "thinking": f"修订方案（第{attempt + 1}轮）：AI 推演新几何结构（思考 {elapsed}s）",
                        "content": f"修订方案（第{attempt + 1}轮）：生成修订建模方案（已输出 {chars} 字）",
                        "validating": f"修订方案（第{attempt + 1}轮）：校验新方案参数合法性",
                    }
                    job.record(ai_diagnostics=value, message=stages.get(phase, f"根据审阅意见修订几何方案（第{attempt + 1}轮）"))

                candidate.modeling_plan = service.reviewer.refine(spec, images, built.files["comparison"], observe_refine, feedback=feedback, adjustment=intent, deadline=deadline)
                candidate.modeling_plan.model_label = service.settings.values()["chat_model"][:100]
                candidate.assumptions = list(candidate.modeling_plan.assumptions)
                if compile_plan(candidate.modeling_plan) == compile_plan(spec.modeling_plan):
                    review["message"] = "外观未通过且 AI 未提出有效修订，保留待改进草稿。"
                    break
                improved = build_model(service, candidate, job, progress_range=(65, 90), review_views=True, fit_photos=not intentional, deadline=deadline)
                # 候选只有制造复测通过才替换当前草稿；下一轮审阅该实际产物。
                spec, result = candidate, improved
                job.record(prepared_spec=spec.model_dump())
                feedback = {}
        except DomainError as error:
            if error.code == "CANCELED":
                raise
            review["message"] = str(error)
            review["evidence"].append({"pass": attempt + 1, "error_code": error.code, "message": str(error), "accepted": False})
            job.record(geometry=result[0].manifest["geometry_check"], outline_fit=result[0].manifest.get("outline_fit"))
            if error.code not in ("BLENDER_GEOMETRY", "BLENDER_DIMENSION", "BLENDER_EXECUTION", "PLAN_COORDINATES") or attempt == policy["max_revisions"]:
                break
            feedback = {"execution_error": str(error)}
    built = result[0]
    review["final_stl_sha256"] = hashlib.sha256(built.files["stl"]).hexdigest()
    review["source_asset_ids"] = list(spec.asset_ids)
    review["source_sha256"] = fingerprints or {}
    job.record(photo_modeling_review=review)
    built.manifest["photo_review"] = review
    return spec, result
