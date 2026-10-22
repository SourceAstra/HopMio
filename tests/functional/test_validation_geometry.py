"""TC-W / TC-G 系列：打印前静态检验（validation.py）与几何工具（geometry/models.py）。"""

import trimesh
import pytest

from yaha.contracts import DomainError, PrintProfile
from yaha.validation import inspect, profile_hash
from yaha.geometry.models import load_mesh, split_shells


def box_stl(tmp_path, name, extents, invert_inner=False):
    body = trimesh.creation.box(extents=extents)
    body.apply_translation([0, 0, extents[2] / 2])
    mesh = body
    if invert_inner:
        inner = trimesh.creation.box(extents=[extents[0] / 2, extents[1] / 2, extents[2] / 2])
        inner.apply_translation([0, 0, extents[2] / 2])
        inner.invert()
        mesh = trimesh.util.concatenate([body, inner])
    path = tmp_path / name
    mesh.export(path)
    return path


class TestProfileHash:
    def test_tc_w_001_profile_hash_stable_and_sensitive(self):
        """TC-W-001 配置哈希稳定且对字段变化敏感。"""
        base = PrintProfile().model_dump()
        assert profile_hash(base) == profile_hash(PrintProfile().model_dump())
        changed = base | {"layer_mm": 0.28}
        assert profile_hash(base) != profile_hash(changed)


class TestInspect:
    def assets_stub(self, path):
        from types import SimpleNamespace
        return SimpleNamespace(path=lambda _identifier: path)

    def test_tc_w_002_fitting_model_passes(self, tmp_path):
        """TC-W-002 合规模型通过全部硬性检查并给出部件统计。"""
        path = box_stl(tmp_path, "ok.stl", [50, 40, 80])
        report = inspect(
            {"revision_id": "r1", "model": {"stl_id": "x"}},
            self.assets_stub(path), PrintProfile(),
        )
        assert report["can_prepare"] is True
        assert report["components"] == 1 and report["cavity_shells"] == 0
        assert report["size_mm"] == [50.0, 40.0, 80.0]
        statuses = {item["name"]: item["status"] for item in report["items"]}
        assert statuses["A1 mini 空间"] == "pass"
        assert statuses["封闭与朝向"] == "pass"
        assert statuses["独立部件"] == "pass"
        # 壁厚与支撑两项为诚实提醒（静态检查不可证明），不是通过项。
        assert statuses["壁厚与细节"] == "warn"
        assert statuses["支撑与摆放"] == "warn"
        assert report["profile_hash"] == profile_hash(PrintProfile().model_dump())

    def test_tc_w_003_oversized_model_fails_space(self, tmp_path):
        """TC-W-003 超出可用空间（180-2*留边）判 fail 且不可准备。"""
        path = box_stl(tmp_path, "big.stl", [190, 40, 80])
        report = inspect(
            {"revision_id": "r1", "model": {"stl_id": "x"}},
            self.assets_stub(path), PrintProfile(),
        )
        assert report["can_prepare"] is False
        space = next(item for item in report["items"] if item["name"] == "A1 mini 空间")
        assert space["status"] == "fail"
        assert "170" in space["detail"]

    def test_tc_w_004_open_mesh_fails_closure(self, tmp_path):
        """TC-W-004 开口网格判 fail 且不可准备。"""
        box = trimesh.creation.box(extents=[20, 20, 20])
        box.faces = box.faces[:-2]  # 删除面制造开口
        path = tmp_path / "open.stl"
        box.export(path)
        report = inspect(
            {"revision_id": "r1", "model": {"stl_id": "x"}},
            self.assets_stub(path), PrintProfile(),
        )
        assert report["can_prepare"] is False
        closed = next(item for item in report["items"] if item["name"] == "封闭与朝向")
        assert closed["status"] == "fail"

    def test_tc_w_005_margin_shrinks_available_space(self, tmp_path):
        """TC-W-005 留边越大可用空间越小。"""
        path = box_stl(tmp_path, "mid.stl", [160, 40, 80])
        loose = inspect(
            {"revision_id": "r1", "model": {"stl_id": "x"}},
            self.assets_stub(path), PrintProfile(margin_mm=0),
        )
        tight = inspect(
            {"revision_id": "r1", "model": {"stl_id": "x"}},
            self.assets_stub(path), PrintProfile(margin_mm=15),
        )
        assert loose["can_prepare"] is True
        assert tight["can_prepare"] is False

    def test_tc_w_006_report_records_revision_and_time(self, tmp_path):
        """TC-W-006 报告绑定版本号与 UTC 时间戳。"""
        path = box_stl(tmp_path, "t.stl", [30, 30, 30])
        report = inspect(
            {"revision_id": "rev-9", "model": {"stl_id": "x"}},
            self.assets_stub(path), PrintProfile(),
        )
        assert report["revision_id"] == "rev-9"
        assert report["checked_at"].endswith("+00:00")


class TestGeometryModels:
    def test_tc_g_001_load_mesh_missing_file(self, tmp_path):
        """TC-G-001 读取不存在的模型文件报领域错误。"""
        with pytest.raises(DomainError, match="模型无法读取"):
            load_mesh(tmp_path / "ghost.stl")

    def test_tc_g_002_load_mesh_garbage_file(self, tmp_path):
        """TC-G-002 读取损坏文件报领域错误。"""
        path = tmp_path / "bad.stl"
        path.write_bytes(b"this is not a mesh")
        with pytest.raises(DomainError, match="模型无法读取"):
            load_mesh(path)

    def test_tc_g_003_split_two_solid_shells(self, tmp_path):
        """TC-G-003 两个独立实体被识别为 2 个部件、0 个内腔。"""
        a = trimesh.creation.box(extents=[10, 10, 10])
        b = trimesh.creation.box(extents=[10, 10, 10])
        b.apply_translation([50, 0, 0])
        path = tmp_path / "two.stl"
        trimesh.util.concatenate([a, b]).export(path)
        parts, cavities = split_shells(load_mesh(path))
        assert len(parts) == 2 and len(cavities) == 0

    def test_tc_g_004_enclosed_cavity_detected_as_negative_shell(self, tmp_path):
        """TC-G-004 封闭空腔识别为负向壳，不算独立实体。"""
        path = box_stl(tmp_path, "cavity.stl", [20, 20, 20], invert_inner=True)
        parts, cavities = split_shells(load_mesh(path))
        assert len(parts) == 1 and len(cavities) == 1

    def test_tc_g_005_valid_mesh_roundtrip(self, tmp_path):
        """TC-G-005 合法 STL 往返读取保留三角形数量。"""
        path = box_stl(tmp_path, "fine.stl", [10, 10, 10])
        mesh = load_mesh(path)
        assert mesh.is_watertight and len(mesh.faces) == 12
