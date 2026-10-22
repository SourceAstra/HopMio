"""脚本草稿、隔离预览与显式采用；项目版本是唯一提交边界。"""

import hashlib
import json
from .script_contracts import ScriptDocument, ScriptRequest, ScriptAdoption, declarations
from .parameters import ParameterTarget
from .building import measure
from ..contracts import DesignSpec, DomainError, Mode
from ..geometry.models import load_mesh


def target(service, request):
    project = service.projects.get(request.id)
    if project["revision_id"] != request.base_revision_id:
        raise DomainError("作品版本已改变，请重新打开脚本编辑器。", "REVISION_CHANGED")
    return project


def describe_script(service, data):
    request = ParameterTarget.model_validate(data)
    with service.lock:
        project = target(service, request)
        saved = service.db.get("settings", "project_script:" + request.id)
        document = saved["document"] if saved and saved["base_revision_id"] == request.base_revision_id else None
        asset_id = (project.get("model") or {}).get("script_document_id")
        if document is None and asset_id:
            document = json.loads(service.assets.path(asset_id).read_text(encoding="utf-8"))
        if document is not None:
            document = ScriptDocument.model_validate(document).model_dump(mode="json")
        candidate = next((item for item in service.projects.history(request.id)
                          if item["parent_id"] == request.base_revision_id and item.get("status") == "draft"
                          and (item.get("model") or {}).get("script_document_id")), None)
        candidate_document = ScriptDocument.model_validate_json(service.assets.path(candidate["model"]["script_document_id"]).read_text(encoding="utf-8")).model_dump(mode="json") if candidate else None
        execution, blender = service.script_executor.status(), service.modeler.status()
        if not blender["available"]:
            execution = {"available": False, "message": blender["message"]}
        return {"document": document, "candidate": candidate, "candidate_document": candidate_document, "execution": execution,
                "blender_version": blender.get("version", ""),
                "source_model_id": (project.get("model") or {}).get("manufacturing_glb_id") or (project.get("model") or {}).get("glb_id")}


def inspect_script(service, data):
    request = ScriptRequest.model_validate(data)
    target(service, request)
    values, controls = declarations(request.document)
    return {"parameters": values, "controls": controls}


def save_script(service, data):
    request = ScriptRequest.model_validate(data)
    # 草稿允许尚未写完的 Python；运行与参数读取才检查语法。
    with service.lock:
        target(service, request)
        service.db.put("settings", "project_script:" + request.id,
                       {"base_revision_id": request.base_revision_id, "document": request.document.model_dump()})
    return {"saved": True}


def preview_script(service, data):
    from ..generation import start_generation
    request = ScriptRequest.model_validate(data)
    document = request.document
    if not document.source.strip():
        raise DomainError("请先粘贴或导入 Blender Python 脚本。", "SCRIPT_REQUIRED")
    values, _ = declarations(document)
    document.parameters = values
    runner = service.script_executor
    status = runner.status()
    if not status["available"]:
        raise DomainError(status["message"], "SCRIPT_SANDBOX_UNAVAILABLE")
    with service.lock:
        project = target(service, request)
        source_id = (project.get("model") or {}).get("stl_id")
        if document.operation == "edit" and not source_id:
            raise DomainError("当前版本没有可修改的模型，请选择重新生成。", "MODEL_REQUIRED")
        source = None
        if document.operation == "edit":
            mesh = load_mesh(service.assets.path(source_id))
            source = json.dumps({"vertices": mesh.vertices.tolist(), "faces": mesh.faces.tolist()}).encode()
        spec = DesignSpec.model_validate(project["spec"])
        spec.mode, spec.provider = Mode.IMPORT, "local"
        spec.modeling_plan = spec.reconstruction_plan = None
        spec.base = spec.hole = False
        spec.asset_ids = []
        constraints = [{"feature": "model." + axis, "expected_mm": value, "max_error_mm": 0.05}
                       for axis, value in zip(("width", "depth", "height"), document.expected_size_mm or [])]
        payload = document.model_dump()

        def build(service, result_spec, previous, job):
            geometry = runner.execute(payload, source, job)
            job.check()
            # 不接受脚本写出的 blend、manifest 或任意输出路径；仅重新导入纯几何。
            build_request = {"plan": {"steps": [], "constraints": constraints}, "preview_views": False,
                             "progress_range": (35, 90)}
            built = service.modeler.build(build_request, {"input.json": geometry}, job)
            built.manifest["origin"] = "外部脚本 · Blender"
            built.manifest["script_document"] = payload
            built.manifest["execution"] = {"mode": "external_script", "ai_used": False, "schema_version": 1,
                                           "script_sha256": hashlib.sha256(document.source.encode()).hexdigest(),
                                           "base_revision_id": request.base_revision_id, "operation": document.operation,
                                           "source_asset_id": source_id if source else None,
                                           "source_sha256": hashlib.sha256(source).hexdigest() if source else None}
            result = measure(built, build_request, job)
            if any(not 0.8 <= value <= 500 for value in result[1].extents):
                raise DomainError("脚本模型宽、深、高须在 0.8～500 mm 之间，请检查坐标单位和造型尺寸。", "SCRIPT_DIMENSION")
            for axis, value in zip(("width", "depth", "height"), result[1].extents.tolist()):
                setattr(result_spec, axis + "_mm", value)
            return DesignSpec.model_validate(result_spec.model_dump()), result

        next_job = start_generation(service, request.id, spec.model_dump(), build_operation=build,
                                    reason="Blender 脚本候选", preview_only=True)
        service.db.put("settings", "project_script:" + request.id,
                       {"base_revision_id": request.base_revision_id, "document": payload})
        return next_job


def adopt_script(service, data):
    request = ScriptAdoption.model_validate(data)
    with service.lock, service.jobs.lock:
        service.jobs.require_idle()
        target(service, request)
        revision = service.db.get("revisions", request.candidate_revision_id)
        if not revision or revision["project_id"] != request.id or revision["parent_id"] != request.base_revision_id or not (revision.get("model") or {}).get("script_document_id"):
            raise DomainError("候选不属于当前作品版本，请重新预览。", "SCRIPT_CANDIDATE")
        values, _ = declarations(request.document)
        request.document.parameters = values
        saved = ScriptDocument.model_validate_json(service.assets.path(revision["model"]["script_document_id"]).read_text(encoding="utf-8")).model_dump(mode="json")
        if json.loads(request.document.model_dump_json()) != saved:
            raise DomainError("脚本或参数与候选不一致，请重新运行预览。", "SCRIPT_CANDIDATE_CHANGED")
        return service.projects.select_revision(request.id, revision["id"], promote=True)
