"""项目与不可变模型版本，回退也保留原版本。"""

import json
import uuid
from datetime import datetime, timezone
from ..contracts import DesignSpec, DomainError


def now():
    return datetime.now(timezone.utc).isoformat()


class Projects:
    def __init__(self, db):
        self.db = db

    def create(self, name: str, spec: dict):
        project = {
            "id": str(uuid.uuid4()),
            "name": (name.strip() or "我的新作品")[:80],
            "spec": spec,
            "revision_id": None,
            "revision_count": 0,
            "created_at": now(),
            "updated_at": now(),
            "exhibited": False,
            "story": "",
            "model": None,
            "validation": None,
            "printed": False,
            "slicing": None,
        }
        self.db.put("projects", project["id"], project)
        return project

    def get(self, identifier):
        project = self.db.get("projects", identifier)
        if not project:
            raise DomainError("这个项目暂时找不到，请回作品柜看看。")
        project["spec"] = DesignSpec.model_validate(project["spec"]).model_dump()
        return project

    def list(self):
        return sorted(
            [self.get(p["id"]) for p in self.db.list("projects")], key=lambda p: p["updated_at"], reverse=True
        )

    def revision(self, identifier, spec, model, reason):
        project = self.get(identifier)
        revision = {
            "id": str(uuid.uuid4()),
            "project_id": identifier,
            "parent_id": project["revision_id"],
            "spec": spec,
            "model": model,
            "reason": reason[:200],
            "created_at": now(),
        }
        project.update(
            spec=spec,
            model=model,
            revision_id=revision["id"],
            revision_count=project["revision_count"] + 1,
            updated_at=now(),
            validation=None,
            printed=False,
            slicing=None,
        )
        with self.db.transaction() as conn:
            conn.execute(
                "INSERT INTO revisions(id,project_id,data) VALUES(?,?,?)",
                (revision["id"], identifier, json.dumps(revision, ensure_ascii=False)),
            )
            conn.execute(
                "UPDATE projects SET data=? WHERE id=?",
                (json.dumps(project, ensure_ascii=False), identifier),
            )
        return project

    def restore(self, identifier, revision_id):
        rev = self.db.get("revisions", revision_id)
        if not rev or rev["project_id"] != identifier:
            raise DomainError("这个版本不属于当前作品。")
        spec = DesignSpec.model_validate(rev["spec"]).model_dump()
        return self.revision(identifier, spec, rev["model"], "回到之前的版本")

    def history(self, identifier):
        self.get(identifier)
        return sorted(
            [r for r in self.db.list("revisions") if r["project_id"] == identifier],
            key=lambda r: r["created_at"],
            reverse=True,
        )

    def delete(self, identifier: str):
        self.get(identifier)
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM revisions WHERE project_id=?", (identifier,))
            conn.execute("DELETE FROM projects WHERE id=?", (identifier,))
        return {"id": identifier, "deleted": True}

    def delete_revision(self, identifier: str, revision_id: str):
        project = self.get(identifier)
        rev = self.db.get("revisions", revision_id)
        if not rev or rev.get("project_id") != identifier:
            raise DomainError("这个版本不存在或不属于当前作品。")
        all_revs = [r for r in self.history(identifier) if r["id"] != revision_id]
        with self.db.transaction() as conn:
            conn.execute(
                "DELETE FROM revisions WHERE id=? AND project_id=?",
                (revision_id, identifier),
            )
            if project.get("revision_id") == revision_id:
                if all_revs:
                    latest = all_revs[0]
                    project["revision_id"] = latest["id"]
                    project["spec"] = latest["spec"]
                    project["model"] = latest["model"]
                else:
                    project["revision_id"] = None
                    project["model"] = None
            project["revision_count"] = len(all_revs)
            project["updated_at"] = now()
            project["validation"] = None
            project["printed"] = False
            project["slicing"] = None
            conn.execute(
                "UPDATE projects SET data=? WHERE id=?",
                (json.dumps(project, ensure_ascii=False), identifier),
            )
        return self.get(identifier)

    def update(self, identifier, **changes):
        project = self.get(identifier)
        project.update(changes, updated_at=now())
        self.db.put("projects", identifier, project)
        return project
