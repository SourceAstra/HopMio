"""TC-SL 系列：真实 Bambu Studio 切片链路（安装了官方切片器才运行）。

覆盖：完整切片成功路径、切片报告一致性、print3mf 导出、未切片/非法配置的错误路径。
模块内共享一次真实切片结果，避免重复跑切片器。
"""

import pytest

from yaha.contracts import DomainError, PrintProfile
from yaha.service import Service
from yaha.slicing.runtime import availability
from yaha.validation import profile_hash

from conftest import wait_job

pytestmark = pytest.mark.skipif(
    not availability()["available"],
    reason="本机未安装 Bambu Studio 切片器，切片功能测试跳过",
)

PROFILE = {"machine": "A1 mini", "nozzle_mm": 0.4, "layer_mm": 0.2, "material": "PLA", "margin_mm": 5}


def starter(service):
    """按名字找欢迎作品，避免被新建作品按更新时间挤到列表后面。"""
    return next(p for p in service.projects.list() if p["name"] == "乌萨奇的第一份礼物")


@pytest.fixture(scope="module")
def service(tmp_path_factory):
    instance = Service(tmp_path_factory.mktemp("slice-service"))
    instance.bootstrap()
    yield instance
    instance.close()


@pytest.fixture(scope="module")
def sliced(service):
    """真实切片一次欢迎作品，返回最终任务记录。"""
    project = service.projects.list()[0]
    job = wait_job(
        service,
        service.call("model.slice", {"id": project["id"], "profile": PROFILE}),
        timeout=900,
    )
    return job


class TestSlicing:
    def test_tc_sl_001_slice_starter_model(self, service, sliced):
        """TC-SL-001 欢迎作品完整切片成功：报告、资产、哈希、版本一致。"""
        project = starter(service)
        assert sliced["status"] == "succeeded", sliced
        slicing = service.projects.get(project["id"])["slicing"]
        assert slicing["status"] == "sliced"
        assert slicing["revision_id"] == project["revision_id"]
        # 注意：profile_hash 以 PrintProfile 校验后的 model_dump（float 化）为准，
        # 直接对输入 dict（int 5）求哈希会得到不同结果。
        assert slicing["profile_hash"] == profile_hash(PrintProfile.model_validate(PROFILE).model_dump())
        assert slicing["printer_model_id"]
        assert slicing["asset_id"] and slicing["report_id"]
        content = service.assets.path(slicing["asset_id"]).read_bytes()
        assert content.startswith(b"PK")  # 3mf 是 zip 包

    def test_tc_sl_002_export_print3mf_after_slice(self, service, sliced):
        """TC-SL-002 切片后可导出 print3mf，指向切片资产。"""
        project = starter(service)
        assert sliced["status"] == "succeeded", sliced
        asset = service.call("project.export", {"id": project["id"], "format": "print3mf"})
        assert asset["extension"] == ".3mf"
        assert asset["kind"] == "sliced"
        assert asset["id"] == service.projects.get(project["id"])["slicing"]["asset_id"]

    def test_tc_sl_003_slice_requires_model(self, service):
        """TC-SL-003 没有模型的作品不能切片。"""
        project = service.call("project.create", {"name": "空作品"})
        with pytest.raises(DomainError, match="模型尺寸或网格未通过"):
            service.call("model.slice", {"id": project["id"], "profile": {}})

    def test_tc_sl_004_slice_rejects_out_of_range_layer(self, service):
        """TC-SL-004 层高超出契约范围被直接拒绝。"""
        project = service.projects.list()[0]
        with pytest.raises(Exception):
            service.call("model.slice", {"id": project["id"], "profile": {"layer_mm": 0.05}})

    def test_tc_sl_005_slice_unknown_nozzle_fails_in_job(self, service):
        """TC-SL-005 官方参数库不存在的喷嘴规格在任务中失败（SLICER_PROFILE）。"""
        project = starter(service)
        job = wait_job(service, service.call("model.slice", {
            "id": project["id"],
            "profile": PROFILE | {"nozzle_mm": 0.3},
        }), timeout=120)
        assert job["status"] == "failed"
        assert job["error_code"] == "SLICER_PROFILE"

    def test_tc_sl_006_profile_change_invalidates_slice(self, service, sliced):
        """TC-SL-006 切片后修改全局打印配置使切片失效（放最后执行）。"""
        project = starter(service)
        assert sliced["status"] == "succeeded", sliced
        assert service.projects.get(project["id"])["slicing"] is not None
        service.call("profile.save", {"profile": PROFILE | {"margin_mm": 8}})
        assert service.projects.get(project["id"])["slicing"] is None
