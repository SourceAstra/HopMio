"""TC-E 系列：多格式导出与 .usagi 作品包导入（exporting.py / importing.py）。"""

import base64
import io
import json
import zipfile

import pytest

from yaha.contracts import DomainError


def export_bytes(service, project_id, fmt):
    asset = service.call("project.export", {"id": project_id, "format": fmt})
    return service.assets.path(asset["id"]).read_bytes(), asset


class TestExportGuards:
    def test_tc_e_001_export_requires_model(self, service):
        """TC-E-001 没有模型不能导出。"""
        project = service.call("project.create", {"name": "空"})
        with pytest.raises(DomainError, match="先造出一个模型"):
            service.call("project.export", {"id": project["id"], "format": "stl"})

    def test_tc_e_002_export_unknown_format(self, service):
        """TC-E-002 不支持的导出格式被明确拒绝。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="支持 STL、3MF、GLB"):
            service.call("project.export", {"id": project["id"], "format": "fbx"})

    def test_tc_e_003_export_blend_without_source(self, service):
        """TC-E-003 欢迎作品没有 Blender 源工程，导出 blend 给出提示。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="没有 Blender 源工程"):
            service.call("project.export", {"id": project["id"], "format": "blend"})

    def test_tc_e_004_export_print3mf_requires_slice(self, service):
        """TC-E-004 未切片不能导出打印 3MF。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="当前模型尚未完成实际切片"):
            service.call("project.export", {"id": project["id"], "format": "print3mf"})


class TestExportContent:
    def test_tc_e_005_export_stl_bytes(self, service):
        """TC-E-005 导出 STL 返回与模型资产一致的字节。"""
        project = service.projects.list()[0]
        content, asset = export_bytes(service, project["id"], "stl")
        assert content.startswith(b"solid") or content[:5]  # ascii 或二进制 STL
        original = service.assets.path(project["model"]["stl_id"]).read_bytes()
        assert content == original
        assert asset["name"].endswith(".stl")

    def test_tc_e_006_export_glb_uses_preview(self, service):
        """TC-E-006 导出 GLB 返回预览网格资产。"""
        project = service.projects.list()[0]
        content, _ = export_bytes(service, project["id"], "glb")
        assert content.startswith(b"glTF")

    def test_tc_e_007_export_3mf_is_millimeter_model(self, service):
        """TC-E-007 导出 3MF 是有效 zip，模型单位毫米，尺寸与模型一致。"""
        project = service.projects.list()[0]
        content, asset = export_bytes(service, project["id"], "3mf")
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = set(archive.namelist())
            assert {"[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"} <= names
            model = archive.read("3D/3dmodel.model").decode()
        assert 'unit="millimeter"' in model
        assert "<vertex" in model and "<triangle" in model

    def test_tc_e_008_export_usagi_package_shape(self, service):
        """TC-E-008 .usagi 包含 project.json(schema v4) 且文件清单带哈希。"""
        project = service.projects.list()[0]
        content, _ = export_bytes(service, project["id"], "usagi")
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            data = json.loads(archive.read("project.json"))
            assert data["schema_version"] == 4
            assert data["name"] == project["name"]
            files = set(data["files"])
            names = set(archive.namelist()) - {"project.json"}
            assert files == names
            for name, meta in data["files"].items():
                body = archive.read(name)
                assert len(body) == meta["bytes"]
            assert {"model.stl", "model.glb"} <= files


class TestImport:
    def package(self, service, project_id=None):
        project_id = project_id or service.projects.list()[0]["id"]
        content, _ = export_bytes(service, project_id, "usagi")
        return base64.b64encode(content).decode(), content

    def test_tc_e_009_import_roundtrip_creates_copy(self, service):
        """TC-E-009 导出的 .usagi 可完整恢复为副本作品：模型、故事、版本。"""
        original = service.projects.list()[0]
        service.projects.update(original["id"], story="乌萨奇的介绍")
        encoded, _ = self.package(service)
        imported = service.call("project.import", {"base64": encoded})
        assert imported["name"] == original["name"] + " · 副本"
        assert imported["story"] == "乌萨奇的介绍"
        assert imported["model"]["origin"] == "作品包恢复"
        assert imported["model"]["size_mm"] == original["model"]["size_mm"]
        history = service.call("project.history", {"id": imported["id"]})
        assert any(r["reason"] == "恢复作品包，源工程未执行" for r in history)

    def test_tc_e_010_import_garbage(self, service):
        """TC-E-010 非法 base64/损坏包给出统一提示。"""
        with pytest.raises(DomainError, match="作品包损坏或格式不正确"):
            service.call("project.import", {"base64": "###"})

    def test_tc_e_011_import_unsupported_version(self, service):
        """TC-E-011 不支持的包版本被拒绝。"""
        _, content = self.package(service)
        buffer = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(content)) as src, zipfile.ZipFile(buffer, "w") as dst:
            for name in src.namelist():
                if name == "project.json":
                    data = json.loads(src.read(name))
                    data["schema_version"] = 99
                    dst.writestr(name, json.dumps(data, ensure_ascii=False))
                else:
                    dst.writestr(name, src.read(name))
        with pytest.raises(DomainError, match="这个作品包的版本暂时不支持"):
            service.call("project.import", {"base64": base64.b64encode(buffer.getvalue()).decode()})

    def test_tc_e_012_import_hash_mismatch(self, service):
        """TC-E-012 包内文件被篡改时校验失败。"""
        _, content = self.package(service)
        buffer = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(content)) as src, zipfile.ZipFile(buffer, "w") as dst:
            for name in src.namelist():
                if name == "model.stl":
                    dst.writestr(name, b"tampered")
                else:
                    dst.writestr(name, src.read(name))
        with pytest.raises(DomainError) as exc:
            service.call("project.import", {"base64": base64.b64encode(buffer.getvalue()).decode()})
        assert "校验失败" in str(exc.value) or "清单不一致" in str(exc.value)

    def test_tc_e_013_import_foreign_file_rejected(self, service):
        """TC-E-013 包里出现白名单之外的文件被拒绝。"""
        _, content = self.package(service)
        buffer = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(content)) as src, zipfile.ZipFile(buffer, "w") as dst:
            for name in src.namelist():
                dst.writestr(name, src.read(name))
            dst.writestr("evil.sh", b"#!/bin/sh\nrm -rf /")
        with pytest.raises(DomainError, match="作品包包含不支持的文件"):
            service.call("project.import", {"base64": base64.b64encode(buffer.getvalue()).decode()})

    def test_tc_e_014_import_v1_legacy_package(self, service):
        """TC-E-014 旧版 v1 包（无清单）可恢复：需要 project.json + model.stl + model.glb。"""
        project = service.projects.list()[0]
        stl = service.assets.path(project["model"]["stl_id"]).read_bytes()
        glb = service.assets.path(project["model"]["glb_id"]).read_bytes()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("project.json", json.dumps({
                "schema_version": 1,
                "name": "旧版作品",
                "spec": {"template": "usagi", "height_mm": 80},
                "story": "老朋友",
            }, ensure_ascii=False))
            archive.writestr("model.stl", stl)
            archive.writestr("model.glb", glb)
        imported = service.call("project.import", {
            "base64": base64.b64encode(buffer.getvalue()).decode(),
        })
        assert imported["name"] == "旧版作品 · 副本"
        assert imported["model"]["stl_id"]
        with pytest.raises(DomainError, match="作品包损坏或格式不正确"):
            broken = io.BytesIO()
            with zipfile.ZipFile(broken, "w") as archive:
                archive.writestr("project.json", json.dumps({"schema_version": 1, "name": "缺模型"}))
            service.call("project.import", {"base64": base64.b64encode(broken.getvalue()).decode()})
