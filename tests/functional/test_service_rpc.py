"""TC-R 系列：Service.call RPC 面板（页面可见的全部能力入口）。"""

import base64
import io

import pytest
from PIL import Image

from yaha.contracts import DomainError


def png_asset(service, name="素材.png"):
    image = Image.new("RGB", (16, 16), "red")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return service.call("asset.upload", {
        "name": name,
        "base64": base64.b64encode(buffer.getvalue()).decode(),
    })


class TestMethodSurface:
    def test_tc_r_001_unknown_method(self, service):
        """TC-R-001 未知方法返回 METHOD_NOT_FOUND。"""
        with pytest.raises(DomainError, match="小屋还不认识这个操作") as exc:
            service.call("hack.system", {})
        assert exc.value.code == "METHOD_NOT_FOUND"

    def test_tc_r_002_workshop_templates(self, service):
        """TC-R-002 模板清单包含乌萨奇/笔筒/名牌三个入口。"""
        templates = service.call("workshop.templates", {})
        assert [t["id"] for t in templates] == ["usagi", "cup", "plaque"]

    def test_tc_r_003_settings_get_merges_runtime(self, service):
        """TC-R-003 设置接口合并运行时状态：建模器带 available，拓竹带 configured。"""
        settings = service.call("settings.get", {})
        for key in ("blender", "reconstruction", "slicer"):
            assert key in settings and "available" in settings[key]
        assert "configured" in settings["bambu"]


class TestProjectRpc:
    def test_tc_r_004_create_project_default_spec(self, service):
        """TC-R-004 project.create 缺省 spec 得到合法默认契约。"""
        project = service.call("project.create", {"name": "新作品"})
        assert project["spec"]["height_mm"] == 80
        assert project["spec"]["mode"] == "text"

    def test_tc_r_005_model_check_requires_model(self, service):
        """TC-R-005 空作品不能做打印检查。"""
        project = service.call("project.create", {"name": "空作品"})
        with pytest.raises(DomainError, match="先到造物桌生成模型"):
            service.call("model.check", {"id": project["id"], "profile": {}})

    def test_tc_r_006_profile_save_invalidates_checks(self, service):
        """TC-R-006 保存新打印配置后，旧检验报告按哈希失效。"""
        project = service.projects.list()[0]
        checked = service.call("model.check", {"id": project["id"], "profile": {}})
        assert checked["validation"]["can_prepare"] is True
        saved = service.call("profile.save", {"profile": {"margin_mm": 10}})
        assert saved["margin_mm"] == 10
        refreshed = service.projects.get(project["id"])
        assert refreshed["validation"] is None

    def test_tc_r_007_profile_save_rejects_invalid(self, service):
        """TC-R-007 非法打印配置在保存时被拒绝。"""
        with pytest.raises(Exception):
            service.call("profile.save", {"profile": {"machine": "X1C"}})

    def test_tc_r_008_project_export_without_model(self, service):
        """TC-R-008 没有模型不能导出。"""
        project = service.call("project.create", {"name": "空作品"})
        with pytest.raises(DomainError, match="先造出一个模型"):
            service.call("project.export", {"id": project["id"], "format": "stl"})

    def test_tc_r_009_select_revision_busy_guard(self, service):
        """TC-R-009 project.select_revision 校验版本归属（忙碌守卫需运行中任务，另测）。"""
        other = service.call("project.create", {"name": "别的"})
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="这个版本不属于当前作品"):
            service.call("project.select_revision", {
                "id": project["id"], "revision_id": other["revision_id"] or "none",
            })

    def test_tc_r_010_project_history(self, service):
        """TC-R-010 project.history 返回倒序版本列表。"""
        project = service.projects.list()[0]
        history = service.call("project.history", {"id": project["id"]})
        assert len(history) == 1
        assert history[0]["reason"].startswith("内置欢迎作品")


class TestIdeaRpc:
    def test_tc_r_011_interpret_local_numbers_and_template(self, service):
        """TC-R-011 本地想法解析：识别模板关键词与毫米高度。"""
        result = service.call("idea.interpret", {
            "prompt": "帮我做一个 12cm 高的笔筒",
            "spec": {}, "cloud": False,
        })
        design = result.get("design", result)
        assert design["template"] == "cup"
        assert design["height_mm"] == 120

    def test_tc_r_012_adjustment_requires_plan(self, service):
        """TC-R-012 无参数方案时 AI 微调入口报 AI_ADJUSTMENT_UNAVAILABLE。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError) as exc:
            service.call("idea.adjustment", {
                "spec": project["spec"], "instruction": "耳朵大一点",
            })
        assert exc.value.code == "AI_ADJUSTMENT_UNAVAILABLE"

    def test_tc_r_013_model_plan_requires_provider(self, service):
        """TC-R-013 model.plan 只接受参数设计或照片重建。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="请选择参数设计或照片表面重建"):
            service.call("model.plan", {"id": project["id"], "spec": {"provider": "local"}})

    def test_tc_r_014_converse_on_project_without_model(self, service):
        """TC-R-014 无模型作品对话不允许生成微调卡片（plan 置空）。"""
        project = service.call("project.create", {"name": "对话作品"})
        result = service.call("idea.converse", {
            "project_id": project["id"], "text": "做个小狗", "spec": project["spec"],
        })
        assert result["action"] == "create"


class TestSecurityRpc:
    def test_tc_r_015_unlock_requires_pin_or_token(self, service):
        """TC-R-015 解锁接口空手调用被拒绝。"""
        with pytest.raises(DomainError, match="请输入家长密码解锁"):
            service.call("settings.unlock", {})

    def test_tc_r_016_bambu_print_requires_print_pin(self, service):
        """TC-R-016 实机制造必须输入专属打印密码。"""
        with pytest.raises(DomainError, match="启动实机制造必须输入专属打印密码"):
            service.call("settings.unlock", {"action": "bambu_print", "project_id": "x"})

    def test_tc_r_017_bambu_print_requires_slicing(self, service):
        """TC-R-017 未切片项目不能发送实机（首次输入打印密码即被记录）。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="项目尚未完成切片"):
            service.call("settings.unlock", {
                "action": "bambu_print", "print_pin": "654321", "project_id": project["id"],
            })
        assert service.settings.public()["print_pin_set"] is True

    def test_tc_r_018_bambu_control_requires_pin(self, service):
        """TC-R-018 实机控制必须输入打印密码。"""
        with pytest.raises(DomainError, match="操作实机必须输入打印密码"):
            service.call("settings.unlock", {"action": "bambu_control", "command": "pause"})

    def test_tc_r_019_unknown_security_action(self, service):
        """TC-R-019 未知安全动作报错。"""
        with pytest.raises(DomainError, match="未知的安全操作"):
            service.call("settings.unlock", {"pin": "123456", "action": "self_destruct"})

    def test_tc_r_020_wrong_guardian_pin_message(self, service):
        """TC-R-020 家长密码错误提示明确（首次设定后）。"""
        service.call("settings.unlock", {"pin": "123456"})
        with pytest.raises(DomainError, match="原家长密码不正确"):
            service.call("settings.unlock", {"pin": "000000"})


class TestModelParametersRpc:
    def test_tc_r_021_describe_requires_base_revision(self, service):
        """TC-R-021 参数描述接口校验版本一致性。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="作品版本已改变"):
            service.call("model.parameters.describe", {
                "schema_version": 1, "id": project["id"], "base_revision_id": "stale",
            })

    def test_tc_r_022_describe_source_mesh_plan(self, service):
        """TC-R-022 欢迎作品可经原网格编辑方案暴露 mesh_scale 主参数。"""
        project = service.projects.list()[0]
        described = service.call("model.parameters.describe", {
            "schema_version": 1, "id": project["id"], "base_revision_id": project["revision_id"],
        })
        assert "mesh_scale" in described["parameters"]
        ui = described["parameters"]["mesh_scale"]
        assert ui["control"] == "slider" and ui["min"] == 0.1 and ui["max"] == 2

    def test_tc_r_023_apply_rejects_unknown_parameter(self, service):
        """TC-R-023 只允许修改作品声明的主参数。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError) as exc:
            service.call("model.parameters.apply", {
                "schema_version": 1, "id": project["id"],
                "base_revision_id": project["revision_id"],
                "parameters": {"hack_scale": 9},
            })
        assert exc.value.code == "PARAMETER_UNKNOWN"

    def test_tc_r_024_apply_rejects_noop(self, service):
        """TC-R-024 参数没有变化时拒绝执行。"""
        project = service.projects.list()[0]
        with pytest.raises(DomainError, match="参数没有变化"):
            service.call("model.parameters.apply", {
                "schema_version": 1, "id": project["id"],
                "base_revision_id": project["revision_id"],
                "parameters": {"mesh_scale": 1},
            })

    def test_tc_r_025_apply_rejects_wrong_type(self, service):
        """TC-R-025 开关参数必须布尔，数值参数必须数值。"""
        project = service.projects.list()[0]
        with pytest.raises(Exception):
            service.call("model.parameters.apply", {
                "schema_version": 1, "id": project["id"],
                "base_revision_id": project["revision_id"],
                "parameters": {"mesh_scale": True},
            })
