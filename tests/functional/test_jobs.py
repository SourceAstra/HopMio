"""TC-J 系列：长任务管理（jobs.py）——排队互斥、取消、失败记录与中断恢复。"""

import time

import pytest

from yaha.contracts import DomainError
from yaha.jobs import Jobs
from yaha.storage.database import Database


@pytest.fixture
def jobs(tmp_path):
    db = Database(tmp_path)
    manager = Jobs(db)
    yield manager
    manager.close()


def test_tc_j_001_job_success_lifecycle(jobs):
    """TC-J-001 任务从 queued 到 succeeded，结果与进度被记录。"""
    def work(ctx):
        ctx.progress(40, "干到一半")
        return {"answer": 42}

    job = jobs.start("generate", "project-1", work, {"spec": {"a": 1}})
    assert job["status"] == "queued"
    assert job["message"] == "乌萨奇准备出发"
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        value = jobs.get(job["id"])
        if value["status"] == "succeeded":
            break
        time.sleep(0.05)
    assert value["status"] == "succeeded"
    assert value["result"] == {"answer": 42}
    assert value["progress"] == 100
    assert value["spec"] == {"a": 1}


def test_tc_j_002_only_one_active_job(jobs):
    """TC-J-002 已有任务运行时再开始报 JOB_BUSY。"""
    import threading
    release = threading.Event()

    def work(ctx):
        release.wait(timeout=5)

    jobs.start("generate", "p1", work)
    with pytest.raises(DomainError) as exc:
        jobs.start("generate", "p2", lambda ctx: None)
    assert exc.value.code == "JOB_BUSY"
    release.set()


def test_tc_j_003_cancel_running_job(jobs):
    """TC-J-003 取消正在运行的任务：协作式停止并标记 canceled。"""
    def work(ctx):
        for _ in range(100):
            ctx.check()
            time.sleep(0.02)
        return {"never": True}

    job = jobs.start("generate", "p1", work)
    time.sleep(0.1)
    canceled = jobs.cancel(job["id"])
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        value = jobs.get(job["id"])
        if value["status"] == "canceled":
            break
        time.sleep(0.05)
    assert value["status"] == "canceled"
    assert value["error_code"] == "CANCELED"
    assert "已停止" in value["message"]


def test_tc_j_004_failure_records_traceback(jobs):
    """TC-J-004 任务异常被记录为 failed，含友好消息与错误码。"""
    def work(ctx):
        raise RuntimeError("爆炸")

    job = jobs.start("generate", "p1", work)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        value = jobs.get(job["id"])
        if value["status"] == "failed":
            break
        time.sleep(0.05)
    assert value["status"] == "failed"
    assert value["error_code"] == "ENGINE_ERROR"
    assert "这次造物遇到问题" in value["message"]
    assert "RuntimeError" in value["traceback"]


def test_tc_j_005_get_missing_job(jobs):
    """TC-J-005 查询不存在的任务报错。"""
    with pytest.raises(DomainError, match="找不到这个造物任务"):
        jobs.get("nope")


def test_tc_j_006_cancel_missing_job(jobs):
    """TC-J-006 取消不存在的任务报错。"""
    with pytest.raises(DomainError, match="找不到这个造物任务"):
        jobs.cancel("nope")


def test_tc_j_007_startup_marks_interrupted_jobs(tmp_path):
    """TC-J-007 重启后遗留的 queued/running 任务标记为 interrupted。"""
    db = Database(tmp_path)
    db.put("jobs", "j1", {"id": "j1", "status": "running", "created_at": "", "updated_at": ""})
    db.put("jobs", "j2", {"id": "j2", "status": "queued", "created_at": "", "updated_at": ""})
    db.put("jobs", "j3", {"id": "j3", "status": "succeeded", "created_at": "", "updated_at": ""})
    manager = Jobs(db)
    try:
        assert manager.get("j1")["status"] == "interrupted"
        assert "中断" in manager.get("j1")["message"]
        assert manager.get("j2")["status"] == "interrupted"
        assert manager.get("j3")["status"] == "succeeded"
    finally:
        manager.close()


def test_tc_j_008_job_list_sorted_by_created_desc(service):
    """TC-J-008 job.list RPC 按创建时间倒序。"""
    listing = service.call("job.list", {})
    created = [job["created_at"] for job in listing]
    assert created == sorted(created, reverse=True)
