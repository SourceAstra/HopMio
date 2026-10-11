from yaha.contracts import DesignSpec
from yaha.service import Service
from yaha.starter import STARTER_NAME, THEME_VERSION


def test_old_starter_is_upgraded_once_and_user_work_is_preserved(tmp_path):
    service = Service(tmp_path)
    try:
        legacy_spec = DesignSpec(template="bunny").model_dump()
        starter = service.projects.create(STARTER_NAME, legacy_spec)
        original = service.projects.revision(
            starter["id"], legacy_spec, {"origin": "旧示例"}, "原来的小兔示例"
        )
        user = service.projects.create("孩子自己的小兔作品", legacy_spec)
        service.bootstrap()
        upgraded = service.projects.get(starter["id"])
        assert upgraded["spec"]["template"] == "usagi"
        assert upgraded["starter_theme"] == THEME_VERSION
        assert upgraded["revision_count"] == 2
        assert any(
            version["id"] == original["revision_id"]
            for version in service.projects.history(starter["id"])
        )
        assert service.projects.get(user["id"]) == user
        service.bootstrap()
        assert service.projects.get(starter["id"])["revision_count"] == 2
    finally:
        service.jobs.executor.shutdown(wait=True)
        service.db.close()
