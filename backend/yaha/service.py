"""领域操作入口；页面只能调用有名字的能力。"""

from .generation import start_generation
from .starter import ensure_starter

import threading
from pathlib import Path
from .contracts import DesignSpec, PrintProfile, DomainError
from .storage.database import Database
from .storage.assets import Assets
from .storage.projects import Projects
from .settings import Settings
from .jobs import Jobs
from .geometry.models import load_mesh, save_model
from .ai.meshy import Meshy
from .ai.understanding import interpret
from .validation import inspect, profile_hash
from .exporting import export_project


class Service:
    def __init__(self, root):
        self.db = Database(Path(root))
        self.assets = Assets(self.db)
        self.projects = Projects(self.db)
        self.settings = Settings(self.db)
        self.jobs = Jobs(self.db)
        self.meshy = Meshy(self.settings, self.assets)
        self.lock = threading.RLock()

    def bootstrap(self):
        ensure_starter(self)
        return {
            "projects": self.projects.list(),
            "settings": self.settings.public(),
            "profile": self.db.get("settings", "profile")
            or PrintProfile().model_dump(),
            "assets": self.db.list("assets"),
            "jobs": self.db.list("jobs"),
        }

    def generate(self, identifier, data, concept=False, adjust=False, resume=None):
        return start_generation(self, identifier, data, concept, adjust, resume)

    def call(self, method, p):
        if method == "job.resume":
            job = self.jobs.get(p["id"])
            if job["status"] not in ("failed", "interrupted", "canceled") or not all(
                k in job for k in ("remote_id", "remote_path", "spec")
            ):
                raise DomainError(
                    "这个任务没有可恢复的云端编号。请检查服务记录，勿重复提交。"
                )
            return self.generate(
                job["project_id"],
                job["spec"],
                concept=job["kind"] == "concept",
                resume=job,
            )
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
        if method == "project.update":
            changes = {
                key: str(p[key])[: (4000 if key == "story" else 80)]
                for key in ("name", "story")
                if key in p
            }
            if "exhibited" in p:
                changes["exhibited"] = bool(p["exhibited"])
            return self.projects.update(p["id"], **changes)
        if method == "asset.upload":
            return self.assets.upload(p["name"], p["base64"])
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
            )
        if method == "model.generate":
            return self.generate(p["id"], p["spec"])
        if method == "model.adjust":
            return self.generate(p["id"], p["spec"], adjust=True)
        if method == "model.concept":
            return self.generate(p["id"], p["spec"], True)
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
            return value
        if method == "project.export":
            return export_project(self.projects.get(p["id"]), self.assets, p["format"])
        if method == "project.import":
            from .importing import import_package

            return import_package(p["base64"], self.assets, self.projects)
        if method == "model.repair":
            with self.lock:
                project = self.projects.get(p["id"])
                if not project["model"]:
                    raise DomainError("还没有模型可以修复。")
                mesh = load_mesh(self.assets.path(project["model"]["stl_id"]))
                import trimesh

                trimesh.repair.fix_normals(mesh)
                trimesh.repair.fill_holes(mesh)
                model = save_model(mesh, self.assets, "基础网格修复")
                return self.projects.revision(
                    project["id"],
                    project["spec"],
                    model,
                    "修正法线并尝试补小孔，需重新体检",
                )
        if method == "settings.get":
            return self.settings.public()
        if method == "settings.unlock":
            return self.settings.unlock(p["pin"])
        if method == "settings.update":
            return self.settings.update(p["token"], p["values"])
        if method == "workshop.templates":
            return [
                {
                    "id": "usagi",
                    "name": "乌萨奇 · 呀哈摆件",
                    "source": "backend/yaha/geometry/templates.py",
                },
                {
                    "id": "cup",
                    "name": "我的笔筒",
                    "source": "backend/yaha/geometry/templates.py",
                },
                {
                    "id": "plaque",
                    "name": "小屋名牌",
                    "source": "backend/yaha/geometry/templates.py",
                },
            ]
        raise DomainError("小屋还不认识这个操作。", "METHOD_NOT_FOUND")
