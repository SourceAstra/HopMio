"""功能测试共享夹具：真实 Service（Blender 可用时为真实建模），隔离临时数据目录。"""

import time

import pytest

from yaha.service import Service


@pytest.fixture
def service(tmp_path):
    """带欢迎作品的完整服务实例。"""
    instance = Service(tmp_path)
    instance.bootstrap()
    yield instance
    instance.close()


@pytest.fixture
def blank_service(tmp_path):
    """不执行 bootstrap 的服务实例，用于空状态与启动逻辑测试。"""
    instance = Service(tmp_path)
    yield instance
    instance.close()


def wait_job(service, job, timeout=180):
    """等待任务离开排队/运行状态并返回最终任务记录。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = service.jobs.get(job["id"])
        if value["status"] not in ("queued", "running"):
            return value
        time.sleep(0.1)
    raise AssertionError(f"任务 {job['id']} 在 {timeout}s 内未结束")
