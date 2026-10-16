"""领域操作入口；页面只能调用有名字的能力。"""

from .generation import start_generation
from .starter import ensure_starter

import threading
from pathlib import Path
from .contracts import DesignSpec, ModelAdjustment, PrintProfile, DomainError
from .storage.database import Database
from .storage.assets import Assets
from .storage.projects import Projects
from .storage.conversations import Conversations, bounded_history, stored_context
from .settings import Settings
from .jobs import Jobs
from .modeling.backend import ModelingBackend
from .modeling.blender_backend import BlenderBackend
from .ai.understanding import interpret, suggest_adjustment
from .ai.client import CloudJSONClient
from .modeling.planner import CloudModelingPlanner, ModelingPlanner, ModelingReviewer, ModelingEditor, start_design
from .modeling.outlines import OpenCVOutlineFitter, OutlineFitter
from .modeling.assessment import CloudPhotoAssessor, PhotoAssessor
from .modeling.design_review import CloudDesignAssessor, DesignAssessor
from .reconstruction.planner import start_design as start_surface_design
from .reconstruction.backend import SurfaceBackend
from .reconstruction.observations import OpenCVPhotoObserver
from .slicing.service import start_slice
from .slicing.runtime import availability as slicer_status
from .validation import inspect, profile_hash
from .exporting import export_project


class Service:
    def __init__(self, root, planner: ModelingPlanner | None = None, modeler: ModelingBackend | None = None, reviewer: ModelingReviewer | None = None, outline_fitter: OutlineFitter | None = None, editor: ModelingEditor | None = None, assessor: PhotoAssessor | None = None, design_assessor: DesignAssessor | None = None):
        self.db = Database(Path(root))
        self.assets = Assets(self.db)
        self.projects = Projects(self.db)
        self.conversations = Conversations(self.db, self.projects)
        self.settings = Settings(self.db)
        self.jobs = Jobs(self.db)
        for asset in self.db.list("assets"):
            if asset.get("kind") == "model-draft":
                self.assets.remove(asset["id"])
        self.modeler = modeler or BlenderBackend()
        self.modelers = {"local": self.modeler, "parametric": self.modeler, "reconstruction": SurfaceBackend(self.modeler)}
        self.plan_operations = {"parametric": start_design, "reconstruction": start_surface_design}
        self.photo_observer = OpenCVPhotoObserver()
        client = CloudJSONClient(self.settings)
        cloud = CloudModelingPlanner(client)
        self.assessor: PhotoAssessor | None = assessor or (CloudPhotoAssessor(client) if planner is None else None)
        self.design_assessor: DesignAssessor | None = design_assessor or (CloudDesignAssessor(client) if planner is None else None)
        self.planner: ModelingPlanner = planner or cloud
        self.reviewer: ModelingReviewer | None = reviewer or (cloud if planner is None else None)
        self.editor: ModelingEditor | None = editor or (cloud if planner is None else None)
        self.outline_fitter: OutlineFitter = outline_fitter or OpenCVOutlineFitter()
        self.lock = threading.RLock()

    def bootstrap(self):
        ensure_starter(self)
        return {
            "projects": self.projects.list(),
            "settings": self.settings.public() | self.runtime_status(),
            "profile": self.db.get("settings", "profile")
            or PrintProfile().model_dump(),
            "assets": self.db.list("assets"),
            "jobs": self.db.list("jobs"),
        }

    def close(self):
        self.jobs.close()
        self.db.close()

    def runtime_status(self):
        return {"blender": self.modeler.status(), "reconstruction": self.modelers["reconstruction"].status(), "slicer": slicer_status()}

    def generate(self, identifier, data, repair=False, *, adjustment=None, auto_photo=False):
        return start_generation(self, identifier, data, repair, adjustment=adjustment, auto_photo=auto_photo)

    def call(self, method, p):
        if method == "bootstrap":
            return self.bootstrap()
        if method == "project.create":
            return self.projects.create(
                p.get("name", "我的新作品"),
                DesignSpec.model_validate(p.get("spec", {})).model_dump(),
            )
        if method == "project.get":
            return self.projects.get(p["id"])
        if method == "project.list":
            return self.projects.list()
        if method == "project.history":
            return self.projects.history(p["id"])
        if method == "project.restore":
            with self.lock:
                return self.projects.restore(p["id"], p["revision_id"])
        if method == "project.select_revision":
            with self.lock:
                if any(job.get("project_id") == p["id"] and job.get("status") in ("queued", "running") for job in self.db.list("jobs")):
                    raise DomainError("作品任务还在进行，请完成或取消后再切换版本。", "PROJECT_BUSY")
                return self.projects.select_revision(p["id"], p["revision_id"])
        if method == "project.update":
            changes = {
                key: str(p[key])[: (4000 if key == "story" else 80)]
                for key in ("name", "story")
                if key in p
            }
            if "exhibited" in p:
                changes["exhibited"] = bool(p["exhibited"])
            return self.projects.update(p["id"], **changes)
        if method == "project.delete":
            with self.lock:
                return self.projects.delete(p["id"])
        if method in ("project.delete_revision", "revision.delete"):
            with self.lock:
                return self.projects.delete_revision(
                    p.get("project_id") or p.get("id"), p["revision_id"]
                )
        if method == "asset.upload":
            return self.assets.upload(p["name"], p["base64"])
        if method == "asset.delete":
            with self.lock:
                self.assets.remove(p["id"])
                return {"ok": True, "id": p["id"]}
        if method == "asset.list":
            return self.db.list("assets")
        if method == "asset.path":
            path = self.assets.path(p["id"])
            return {"path": str(path), "mime": self.db.get("assets", p["id"])["mime"]}
        if method == "idea.interpret":
            return interpret(
                p["prompt"],
                p["spec"],
                self.settings,
                self.assets,
                p.get("cloud", False),
                history=p.get("history"),
            )
        if method == "conversation.get":
            return self.conversations.get(p["project_id"])
        if method == "conversation.save":
            return self.conversations.save(p["project_id"], p["messages"], p.get("expected_version"))
        if method == "idea.converse":
            from .ai.conversation import converse
            spec = DesignSpec.model_validate(p.get("spec", {})).model_dump()
            project_id, revision = p.get("project_id"), p.get("revision_id")
            project = self.projects.get(project_id) if project_id else None
            if project and project["revision_id"] != revision:
                raise DomainError("作品版本已改变，请基于当前模型继续对话。", "REVISION_CHANGED")
            if not project or not project.get("model"):
                # 待生成的参数计划并不等于已有模型，不能生成无法执行的微调卡片。
                spec["modeling_plan"] = None
            history, pending = stored_context(self.conversations.get(project_id)["messages"], revision) if project_id else ([], None)
            if isinstance(p.get("history"), list):
                history = bounded_history(p["history"])
            if isinstance(p.get("pending_proposal"), dict) and p["pending_proposal"].get("revision") == revision:
                pending = p["pending_proposal"]
            result = converse(p.get("text", ""), spec, self.settings, self.assets, history=history, pending=pending, selection=p.get("selection"), location_asset_id=p.get("location_asset_id"), location_point=p.get("location_point"))
            if project_id and self.projects.get(project_id)["revision_id"] != revision:
                raise DomainError("作品版本已改变，请基于当前模型继续对话。", "REVISION_CHANGED")
            return result
        if method == "idea.adjustment":
            spec = DesignSpec.model_validate(p.get("spec", {})).model_dump()
            if not spec.get("modeling_plan"):
                raise DomainError(
                    "当前作品没有可编辑的 AI 参数方案，请先完成一键建模。",
                    "AI_ADJUSTMENT_UNAVAILABLE",
                )
            project_id, revision = p.get("project_id"), p.get("revision_id")
            if project_id and self.projects.get(project_id)["revision_id"] != revision:
                raise DomainError("作品版本已改变，请基于当前模型继续对话。", "REVISION_CHANGED")
            history, pending = stored_context(self.conversations.get(project_id)["messages"], revision) if project_id else ([], None)
            if isinstance(p.get("history"), list):
                history = bounded_history(p["history"])
            if isinstance(p.get("pending_proposal"), dict) and p["pending_proposal"].get("revision") == revision:
                pending = p["pending_proposal"]
            result = suggest_adjustment(p.get("instruction", ""), spec, self.settings, self.assets, p.get("location_asset_id"), p.get("location_point"), history=history, pending=pending)
            if project_id and self.projects.get(project_id)["revision_id"] != revision:
                raise DomainError("作品版本已改变，本次建议没有覆盖当前对话，请继续描述。", "REVISION_CHANGED")
            return result
        if method == "model.generate":
            return self.generate(p["id"], p["spec"], auto_photo=p.get("auto_photo", True) is True)
        if method == "model.adjust":
            return self.generate(p["id"], p["spec"], adjustment=ModelAdjustment.model_validate(p["adjustment"]))
        if method == "model.slice":
            return start_slice(self, p["id"], p["profile"])
        if method == "model.plan":
            spec = DesignSpec.model_validate(p["spec"])
            operation = self.plan_operations.get(spec.provider)
            if operation is None:
                raise DomainError("请选择参数设计或照片表面重建。")
            return operation(self, p["id"], spec.model_dump())
        if method == "job.get":
            return self.jobs.get(p["id"])
        if method == "job.cancel":
            return self.jobs.cancel(p["id"])
        if method == "job.list":
            return sorted(
                self.db.list("jobs"), key=lambda x: x["created_at"], reverse=True
            )
        if method == "model.check":
            with self.lock:
                project = self.projects.get(p["id"])
                if not project["model"]:
                    raise DomainError("先到造物桌生成模型。")
                profile = PrintProfile.model_validate(p["profile"])
                report = inspect(project, self.assets, profile)
                return self.projects.update(p["id"], validation=report)
        if method == "profile.save":
            value = PrintProfile.model_validate(p["profile"]).model_dump()
            self.db.put("settings", "profile", value)
            for project in self.projects.list():
                if project["validation"] and project["validation"][
                    "profile_hash"
                ] != profile_hash(value):
                    self.projects.update(project["id"], validation=None)
                if project.get("slicing") and project["slicing"]["profile_hash"] != profile_hash(value):
                    self.projects.update(project["id"], slicing=None)
            return value
        if method == "project.export":
            return export_project(self.projects.get(p["id"]), self.assets, p["format"])
        if method == "studio.open":
            from .slicing.handoff import open_studio
            return open_studio(self.assets, p.get("asset_id"))
        if method == "project.import":
            from .importing import import_package

            return import_package(p["base64"], self.assets, self.projects)
        if method == "model.repair":
            project = self.projects.get(p["id"])
            return self.generate(project["id"], project["spec"], repair=True)
        if method in ("settings.models.discover", "settings.models.test"):
            from .ai.model_probe import discover_models, test_model
            return (discover_models if method.endswith("discover") else test_model)(self.settings, p)
        if method == "settings.get":
            return self.settings.public() | self.runtime_status()
        if method == "settings.unlock":
            return self.settings.unlock(p["pin"])
        if method == "settings.update":
            return self.settings.update(p.get("token", ""), p["values"]) | self.runtime_status()
        if method == "workshop.templates":
            return [
                {
                    "id": "usagi",
                    "name": "乌萨奇 · 呀哈摆件",
                    "source": "backend/yaha/modeling/templates.py",
                },
                {
                    "id": "cup",
                    "name": "我的笔筒",
                    "source": "backend/yaha/modeling/templates.py",
                },
                {
                    "id": "plaque",
                    "name": "小屋名牌",
                    "source": "backend/yaha/modeling/templates.py",
                },
            ]
        raise DomainError("小屋还不认识这个操作。", "METHOD_NOT_FOUND")
