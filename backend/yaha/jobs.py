"""长任务不阻塞界面，结果只写回任务开始时的模型版本。"""

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from .contracts import DomainError
from .storage.projects import now


class JobContext:
    def __init__(self, manager, identifier):
        self.manager = manager
        self.id = identifier

    def check(self):
        if self.manager.events[self.id].is_set():
            raise DomainError(
                "这次造物已停止。云端已提交的任务可能继续计费。", "CANCELED"
            )

    def record(self, **changes):
        with self.manager.lock:
            value = self.manager.db.get("jobs", self.id)
            value.update(changes, updated_at=now())
            self.manager.db.put("jobs", self.id, value)

    def progress(self, value, message):
        self.record(progress=round(value), message=message)


class Jobs:
    def __init__(self, db):
        self.db = db
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.events = {}
        for value in db.list("jobs"):
            if value["status"] in ("queued", "running"):
                value.update(
                    status="interrupted",
                    message="小屋上次关闭中断了任务，云端编号保留，请先检查服务记录。",
                )
                db.put("jobs", value["id"], value)

    def start(self, kind, project_id, work, metadata=None):
        identifier = str(uuid.uuid4())
        job = {
            **(metadata or {}),
            "id": identifier,
            "kind": kind,
            "project_id": project_id,
            "status": "queued",
            "progress": 0,
            "message": "乌萨奇准备出发",
            "created_at": now(),
            "updated_at": now(),
        }
        self.db.put("jobs", identifier, job)
        self.events[identifier] = threading.Event()
        self.executor.submit(self.run, identifier, work)
        return job

    def run(self, identifier, work):
        ctx = JobContext(self, identifier)
        try:
            ctx.record(status="running")
            ctx.check()
            result = work(ctx)
            ctx.check()
            ctx.record(
                status="succeeded", progress=100, message="作品做好啦！", result=result
            )
        except Exception as error:
            ctx.record(
                status="canceled"
                if getattr(error, "code", "") == "CANCELED"
                else "failed",
                message=str(error)
                if isinstance(error, DomainError)
                else "这次造物遇到问题，请检查材料或参数后重试。",
                error_code=getattr(error, "code", "ENGINE_ERROR"),
            )

    def get(self, identifier):
        value = self.db.get("jobs", identifier)
        if not value:
            raise DomainError("找不到这个造物任务。")
        return value

    def cancel(self, identifier):
        self.get(identifier)
        if identifier in self.events:
            self.events[identifier].set()
        return self.get(identifier)
