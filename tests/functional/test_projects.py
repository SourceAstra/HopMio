"""TC-P 系列：作品存储与不可变版本历史（projects.py + starter 欢迎作品）。"""

import pytest

from yaha.contracts import DomainError


def make_project(service, name="测试作品", **spec_overrides):
    spec = {"template": "cup", "height_mm": 40}
    spec.update(spec_overrides)
    return service.call("project.create", {"name": name, "spec": spec})


class TestBootstrapAndStarter:
    def test_tc_p_001_starter_project_exists(self, service):
        """TC-P-001 bootstrap 生成欢迎作品：乌萨奇示例带模型与一个版本。"""
        projects = service.projects.list()
        assert len(projects) == 1
        starter = projects[0]
        assert starter["name"] == "乌萨奇的第一份礼物"
        assert starter["revision_count"] == 1
        assert starter["model"] and starter["model"]["stl_id"] and starter["model"]["glb_id"]
        assert starter["model"]["origin"] == "乌萨奇主题 · 内置示例"
        assert starter["printed"] is False and starter["slicing"] is None

    def test_tc_p_002_bootstrap_payload_shape(self, blank_service):
        """TC-P-002 bootstrap 返回完整页面初始化数据。"""
        payload = blank_service.bootstrap()
        assert set(payload) == {
            "projects", "settings", "profile", "assets", "material_library", "jobs",
        }
        assert set(("blender", "reconstruction", "slicer", "bambu")) <= set(payload["settings"])
        assert payload["profile"]["machine"] == "A1 mini"

    def test_tc_p_003_bootstrap_idempotent(self, service):
        """TC-P-003 重复 bootstrap 不会复制欢迎作品。"""
        service.bootstrap()
        assert len(service.projects.list()) == 1


class TestProjectCrud:
    def test_tc_p_004_create_defaults_and_truncation(self, service):
        """TC-P-004 新建作品：空名回退默认名，超长名截断 80。"""
        blank = make_project(service, name="   ")
        assert blank["name"] == "我的新作品"
        assert blank["revision_id"] is None and blank["model"] is None
        long = make_project(service, name="好" * 100)
        assert len(long["name"]) == 80

    def test_tc_p_005_create_spec_self_heals(self, service):
        """TC-P-005 建作品时 spec 走 DesignSpec 契约自愈。"""
        project = make_project(service, provider="reconstruction", height_mm=9999)
        assert project["spec"]["provider"] == "parametric"
        assert project["spec"]["height_mm"] == 500.0

    def test_tc_p_006_get_missing_project(self, service):
        """TC-P-006 读取不存在的作品报领域错误。"""
        with pytest.raises(DomainError, match="这个项目暂时找不到"):
            service.projects.get("no-such-id")

    def test_tc_p_007_list_sorted_by_recent_update(self, service):
        """TC-P-007 作品列表按更新时间倒序。"""
        first = make_project(service, name="甲")
        second = make_project(service, name="乙")
        service.projects.update(first["id"], story="碰一下甲")
        ids = [p["id"] for p in service.projects.list()]
        assert ids.index(first["id"]) < ids.index(second["id"])

    def test_tc_p_008_update_story_and_exhibited(self, service):
        """TC-P-008 更新作品信息：story 截断 4000、name 截断 80、exhibited 布尔化。"""
        project = make_project(service)
        updated = service.call("project.update", {
            "id": project["id"], "story": "故" * 5000, "name": "名" * 100, "exhibited": "yes",
        })
        assert len(updated["story"]) == 4000
        assert len(updated["name"]) == 80
        assert updated["exhibited"] is True

    def test_tc_p_009_delete_removes_revisions_and_conversation(self, service):
        """TC-P-009 删除作品连带删除版本记录与会话，不再可读。"""
        project = make_project(service)
        service.projects.revision(project["id"], project["spec"], {"stl_id": "x"}, "第二版")
        service.conversations.save(project["id"], [{"id": "m1", "sender": "user", "content": "hi"}], 0)
        result = service.projects.delete(project["id"])
        assert result == {"id": project["id"], "deleted": True}
        with pytest.raises(DomainError):
            service.projects.get(project["id"])
        remaining = [r for r in service.db.list("revisions") if r["project_id"] == project["id"]]
        assert remaining == []
        assert service.db.get("settings", "project_conversation:" + project["id"]) is None


class TestRevisionLifecycle:
    def test_tc_p_010_revision_activates_and_clears_state(self, service):
        """TC-P-010 新版本激活后计数+1，检验/切片/打印状态全部失效。"""
        project = make_project(service)
        service.projects.update(
            project["id"], validation={"stale": True}, printed=True, slicing={"stale": True}
        )
        updated = service.projects.revision(
            project["id"], project["spec"] | {"height_mm": 55}, {"stl_id": "new"}, "改高度"
        )
        assert updated["revision_count"] == 1
        assert updated["validation"] is None
        assert updated["printed"] is False and updated["slicing"] is None
        assert updated["model"] == {"stl_id": "new"}
        history = service.projects.history(project["id"])
        assert len(history) == 1 and history[0]["status"] == "saved"

    def test_tc_p_011_restore_creates_new_revision(self, service):
        """TC-P-011 回退生成新版本（不可变历史），旧版本仍可再回退。"""
        project = make_project(service)
        v1 = service.projects.revision(project["id"], project["spec"] | {"height_mm": 50}, {"height": 50}, "v1")
        v2 = service.projects.revision(project["id"], project["spec"] | {"height_mm": 70}, {"height": 70}, "v2")
        assert v2["revision_count"] == 2
        back = service.projects.restore(project["id"], v1["revision_id"])
        assert back["revision_count"] == 3
        assert back["model"] == {"height": 50}
        reasons = {r["reason"] for r in service.projects.history(project["id"])}
        assert "回到之前的版本" in reasons

    def test_tc_p_012_restore_foreign_revision_rejected(self, service):
        """TC-P-012 不能回退到别的作品的版本。"""
        a = make_project(service, name="甲")
        b = make_project(service, name="乙")
        rev = service.projects.revision(b["id"], b["spec"], {}, "乙的版本")
        with pytest.raises(DomainError, match="这个版本不属于当前作品"):
            service.projects.restore(a["id"], rev["revision_id"])

    def test_tc_p_013_select_revision_switches_without_new_revision(self, service):
        """TC-P-013 切换到旧版本只移动指针：计数不变、状态失效、同版本幂等。"""
        project = make_project(service)
        v1 = service.projects.revision(project["id"], project["spec"] | {"height_mm": 55}, {"height": 55}, "v1")
        v2 = service.projects.revision(project["id"], project["spec"] | {"height_mm": 66}, {"height": 66}, "v2")
        service.projects.update(project["id"], validation={"stale": True})
        switched = service.projects.select_revision(project["id"], v1["revision_id"])
        assert switched["revision_count"] == 2
        assert switched["validation"] is None and switched["model"] == {"height": 55}
        again = service.projects.select_revision(project["id"], v1["revision_id"])
        assert again["revision_id"] == switched["revision_id"]

    def test_tc_p_014_select_foreign_revision_rejected(self, service):
        """TC-P-014 切换到别的作品的版本被拒绝。"""
        a = make_project(service, name="甲")
        b = make_project(service, name="乙")
        rev = service.projects.revision(b["id"], b["spec"], {}, "乙的版本")
        with pytest.raises(DomainError, match="这个版本不属于当前作品"):
            service.call("project.select_revision", {"id": a["id"], "revision_id": rev["revision_id"]})

    def test_tc_p_015_delete_active_revision_falls_back_to_latest(self, service):
        """TC-P-015 删除当前版本后自动指向剩余最新版本。"""
        project = make_project(service)
        v1 = service.projects.revision(project["id"], project["spec"] | {"height_mm": 50}, {"height": 50}, "v1")
        v2 = service.projects.revision(project["id"], project["spec"] | {"height_mm": 70}, {"height": 70}, "v2")
        updated = service.projects.delete_revision(project["id"], v2["revision_id"])
        assert updated["revision_id"] == v1["revision_id"]
        assert updated["model"] == {"height": 50}
        assert updated["revision_count"] == 1

    def test_tc_p_016_delete_last_revision_empties_project(self, service):
        """TC-P-016 删除最后一个版本后作品回到无模型状态。"""
        project = make_project(service)
        rev = service.projects.revision(project["id"], project["spec"], {"stl_id": "x"}, "唯一版本")
        updated = service.projects.delete_revision(project["id"], rev["revision_id"])
        assert updated["revision_id"] is None
        assert updated["model"] is None
        assert updated["revision_count"] == 0

    def test_tc_p_017_delete_missing_revision(self, service):
        """TC-P-017 删除不存在的版本报错。"""
        project = make_project(service)
        with pytest.raises(DomainError, match="这个版本不存在或不属于当前作品"):
            service.projects.delete_revision(project["id"], "missing")
