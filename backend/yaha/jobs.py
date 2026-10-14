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
        self.committed = False

    def check(self):
        event = self.manager.events.get(self.id)
        if not self.committed and event and event.is_set():
            raise DomainError(
                "这次造物已停止，已保存的版本保留。", "CANCELED"
            )

    def record(self, **changes):
        with self.manager.lock:
            value = self.manager.db.get("jobs", self.id)
            value.update(changes, updated_at=now())
            self.manager.db.put("jobs", self.id, value)

    def progress(self, value, message):
        self.record(progress=round(value), message=message)

    def tool_record(self, stage, **changes):
        with self.manager.lock:
            value = self.manager.db.get("jobs", self.id)
            records = value.get("tool_records", {})
            records[stage] = records.get(stage, {}) | changes
            self.record(tool_records=records)

    def commit(self, work):
        with self.manager.lock:
            self.check()
            result = work()
            self.committed = True
            return result


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
                    message="小屋上次关闭中断了任务，原作品已保留。",
                )
                db.put("jobs", value["id"], value)

    def start(self, kind, project_id, work, metadata=None):
        with self.lock:
            if len(self.events) >= 8:
                raise DomainError("造物任务队列已满，请等待或停止已有任务。", "JOB_BUSY")
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
                status="succeeded", progress=100, message=(result.get("completion") or {}).get("message", "作品做好啦！"), result=result
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
        finally:
            with self.lock:
                self.events.pop(identifier, None)

    def close(self):
        with self.lock:
            for event in self.events.values():
                event.set()
        self.executor.shutdown(wait=True)

    def get(self, identifier):
        value = self.db.get("jobs", identifier)
        if not value:
            raise DomainError("找不到这个造物任务。")
        return value

    def cancel(self, identifier):
        self.get(identifier)
        with self.lock:
            if identifier in self.events:
                self.events[identifier].set()
        return self.get(identifier)
