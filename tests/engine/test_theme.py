from yaha.contracts import DesignSpec
from yaha.service import Service


def test_existing_legacy_and_user_work_are_preserved(tmp_path):
    service = Service(tmp_path)
    try:
        legacy_spec = DesignSpec(template="bunny").model_dump()
        starter = service.projects.create('旧版欢迎作品', legacy_spec)
        original = service.projects.revision(
            starter["id"], legacy_spec, {"origin": "旧示例"}, "原来的小兔示例"
        )
        user = service.projects.create("孩子自己的小兔作品", legacy_spec)
        service.bootstrap()
        preserved = service.projects.get(starter["id"])
        assert preserved["spec"]["template"] == "bunny"
        assert preserved["revision_count"] == 1
        assert any(
            version["id"] == original["revision_id"]
            for version in service.projects.history(starter["id"])
        )
        assert service.projects.get(user["id"]) == user
        service.bootstrap()
        assert service.projects.get(starter["id"])["revision_count"] == 1
    finally:
        service.close()
