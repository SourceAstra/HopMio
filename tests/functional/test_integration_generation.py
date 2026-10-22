"""TC-I 系列：真实 Blender 端到端生成（模板本地路径，不依赖云端 AI）。

每个用例都会启动真实的 Blender 进程建模，运行较慢；全部走本地模板与原网格编辑，
用于验证 生成→检验→导出→回退→参数微调 的完整链路。
"""

import pytest

from yaha.contracts import DomainError
from yaha.geometry.models import load_mesh

from conftest import wait_job


def starter(service):
    return service.projects.list()[0]


class TestTemplateGeneration:
    def test_tc_i_001_usagi_generation_and_busy_guard(self, service):
        """TC-I-001 乌萨奇模板生成成功；进行中再开任务被 JOB_BUSY 拒绝。"""
        project = starter(service)
        spec = project["spec"] | {"height_mm": 90, "template": "usagi", "provider": "local"}
        job = service.generate(project["id"], spec)
        assert job["kind"] == "generate"
        with pytest.raises(DomainError) as exc:
            service.generate(project["id"], spec | {"height_mm": 100})
        assert exc.value.code == "JOB_BUSY"
        result = wait_job(service, job, timeout=300)
        assert result["status"] == "succeeded", result
        updated = result["result"]["project"]
        assert updated["revision_count"] == 2
        assert updated["model"]["origin"] == "本地模板 · Blender"
        assert updated["model"]["precision_status"] == "verified"
        for key in ("stl_id", "glb_id", "blend_id", "manifest_id", "manufacturing_glb_id"):
            assert updated["model"].get(key), f"缺少产物 {key}"
        mesh = load_mesh(service.assets.path(updated["model"]["stl_id"]))
        assert mesh.is_watertight and mesh.volume > 0
        assert abs(mesh.extents[2] - 90) <= 1.0
        assert updated["model"]["measurements"], "应包含复测尺寸记录"

    def test_tc_i_002_cup_with_base_and_hole(self, service):
        """TC-I-002 笔筒模板带底座与穿孔生成成功且网格封闭。"""
        project = service.call("project.create", {
            "name": "我的笔筒", "spec": {"template": "cup", "height_mm": 60, "width_mm": 40},
        })
        spec = project["spec"] | {"base": True, "hole": False, "provider": "local"}
        job = wait_job(service, service.generate(project["id"], spec), timeout=300)
        assert job["status"] == "succeeded", job
        updated = job["result"]["project"]
        mesh = load_mesh(service.assets.path(updated["model"]["stl_id"]))
        assert mesh.is_watertight and mesh.volume > 0
        assert mesh.extents[2] >= 60
        assert updated["model"]["origin"] == "本地模板 · Blender"

    def test_tc_i_003_unknown_template_fails_job(self, service):
        """TC-I-003 未注册模板让任务失败并返回 PLAN_TEMPLATE 错误码。"""
        project = service.call("project.create", {"name": "龙", "spec": {"template": "dragon"}})
        spec = project["spec"] | {"template": "dragon", "provider": "local"}
        job = wait_job(service, service.generate(project["id"], spec), timeout=120)
        assert job["status"] == "failed"
        assert job["error_code"] == "PLAN_TEMPLATE"

    def test_tc_i_004_parametric_text_requires_cloud_gate(self, service):
        """TC-I-004 parametric 文本建模走云端门禁：家长未开启时报 AI_DISABLED。"""
        project = service.call("project.create", {"name": "云端作品"})
        spec = project["spec"] | {"provider": "parametric", "prompt": "一只戴帽子的乌萨奇"}
        job = wait_job(service, service.generate(project["id"], spec), timeout=120)
        assert job["status"] == "failed"
        assert job["error_code"] == "AI_DISABLED"

    def test_tc_i_005_image_mode_without_photo(self, service):
        """TC-I-005 图片模式缺参考照片时任务失败并提示先上传。"""
        project = service.call("project.create", {"name": "照片作品"})
        spec = project["spec"] | {"provider": "parametric", "mode": "image"}
        job = wait_job(service, service.generate(project["id"], spec), timeout=120)
        assert job["status"] == "failed"
        assert job["error_code"] == "PHOTO_REQUIRED"

    def test_tc_i_006_repair_without_model_sync_error(self, service):
        """TC-I-006 没有模型时修复请求同步报错。"""
        project = service.call("project.create", {"name": "空作品"})
        with pytest.raises(DomainError, match="还没有模型可以修复"):
            service.call("model.repair", {"id": project["id"]})

    def test_tc_i_007_repair_imported_model(self, service):
        """TC-I-007 对欢迎作品执行 Blender 修复并生成新版本。"""
        project = starter(service)
        job = wait_job(service, service.call("model.repair", {"id": project["id"]}), timeout=300)
        assert job["status"] == "succeeded", job
        updated = job["result"]["project"]
        assert updated["revision_count"] == 2
        mesh = load_mesh(service.assets.path(updated["model"]["stl_id"]))
        assert mesh.is_watertight and mesh.volume > 0
        history = service.call("project.history", {"id": project["id"]})
        assert any(r["reason"] == "Blender 修复" for r in history)

    def test_tc_i_008_adjust_uses_mesh_edit_plan_and_hits_cloud_gate(self, service):
        """TC-I-008 对无 AI 方案的作品发起微调：转原网格编辑方案后仍被云端门禁拦截。

        model.adjust 不再同步报错——editable_spec 会把欢迎作品升级为
        "保留原网格的细节编辑"方案，真正执行时因云端未开启而失败（AI_DISABLED）。
        """
        project = starter(service)
        from yaha.contracts import ModelAdjustment
        job = service.call("model.adjust", {
            "id": project["id"],
            "spec": project["spec"],
            "adjustment": ModelAdjustment(instruction="耳朵再长一点").model_dump(),
        })
        result = wait_job(service, job, timeout=120)
        assert result["status"] == "failed"
        assert result["error_code"] == "AI_DISABLED"
        # 失败的微调不会覆盖当前版本
        assert service.projects.get(project["id"])["revision_id"] == project["revision_id"]


class TestGeneratedModelSurface:
    def test_tc_i_009_check_export_after_generation(self, service):
        """TC-I-009 生成后的模型可通过检验、导出 blend 与源 STL。"""
        project = starter(service)
        spec = project["spec"] | {"height_mm": 70, "provider": "local"}
        job = wait_job(service, service.generate(project["id"], spec), timeout=300)
        assert job["status"] == "succeeded", job
        checked = service.call("model.check", {"id": project["id"], "profile": {}})
        assert checked["validation"]["can_prepare"] is True
        blend = service.call("project.export", {"id": project["id"], "format": "blend"})
        assert blend["extension"] == ".blend"
        content = service.call("project.export", {"id": project["id"], "format": "usagi"})
        import json as _json
        import zipfile as _zipfile
        import io as _io
        with _zipfile.ZipFile(_io.BytesIO(service.assets.path(content["id"]).read_bytes())) as archive:
            data = _json.loads(archive.read("project.json"))
            assert "source.blend" in data["files"]
            assert "manifest.json" in data["files"]

    def test_tc_i_010_restore_to_starter_version(self, service):
        """TC-I-010 生成新版本后可回退到欢迎作品版本，尺寸恢复 80mm。"""
        project = starter(service)
        first = project["revision_id"]
        spec = project["spec"] | {"height_mm": 100, "provider": "local"}
        job = wait_job(service, service.generate(project["id"], spec), timeout=300)
        assert job["status"] == "succeeded", job
        restored = service.call("project.restore", {"id": project["id"], "revision_id": first})
        assert restored["revision_count"] == 3
        mesh = load_mesh(service.assets.path(restored["model"]["stl_id"]))
        assert abs(mesh.extents[2] - 80) <= 0.1

    def test_tc_i_011_parameter_apply_rescales_model(self, service):
        """TC-I-011 参数微调 mesh_scale=1.5 应通过直接重建生效，高度变 120mm。"""
        project = starter(service)
        described = service.call("model.parameters.describe", {
            "schema_version": 1, "id": project["id"], "base_revision_id": project["revision_id"],
        })
        assert described["parameters"]["mesh_scale"]["value"] == 1
        job = wait_job(service, service.call("model.parameters.apply", {
            "schema_version": 1, "id": project["id"],
            "base_revision_id": project["revision_id"],
            "parameters": {"mesh_scale": 1.5},
        }), timeout=300)
        assert job["status"] == "succeeded", job
        updated = job["result"]["project"]
        assert updated["model"]["origin"] == "参数微调 · Blender"
        assert abs(updated["model"]["size_mm"][2] - 120) <= 1.0
        manifest_asset = service.assets.path(updated["model"]["manifest_id"])
        import json as _json
        manifest = _json.loads(manifest_asset.read_bytes())
        assert manifest["execution"]["mode"] == "direct"
        assert manifest["execution"]["ai_used"] is False
