import base64
import io
import time
import numpy as np
import pytest
from PIL import Image, ImageDraw
from yaha.service import Service
from yaha.contracts import DesignSpec, PrintProfile, DomainError
from yaha.geometry.models import generate_local, load_mesh


@pytest.fixture
def service(tmp_path):
    instance = Service(tmp_path)
    yield instance
    instance.jobs.executor.shutdown(wait=True)
    instance.db.close()


def wait(service, job):
    for _ in range(100):
        value = service.jobs.get(job["id"])
        if value["status"] not in ("queued", "running"):
            return value
        time.sleep(0.05)
    pytest.fail("job did not finish")


def image_asset(service):
    image = Image.new("RGBA", (100, 100), "white")
    ImageDraw.Draw(image).ellipse((20, 10, 80, 90), fill="black")
    data = io.BytesIO()
    image.save(data, format="PNG")
    return service.assets.upload("画.png", base64.b64encode(data.getvalue()).decode())


def test_full_workflow_versions_checks_export_and_restore(service):
    project = service.bootstrap()["projects"][0]
    first = project["revision_id"]
    checked = service.call(
        "model.check", {"id": project["id"], "profile": PrintProfile().model_dump()}
    )
    assert checked["validation"]["can_prepare"]
    spec = project["spec"] | {"height_mm": 120, "base": True, "hole": True}
    job = wait(service, service.generate(project["id"], spec))
    assert job["status"] == "succeeded", job
    updated = job["result"]["project"]
    assert updated["revision_count"] == 2 and updated["validation"] is None
    assert load_mesh(service.assets.path(updated["model"]["stl_id"])).is_watertight
    exported = service.call("project.export", {"id": project["id"], "format": "3mf"})
    mesh = load_mesh(service.assets.path(exported["id"]))
    assert np.allclose(mesh.extents, updated["model"]["size_mm"], atol=0.02)
    restored = service.call(
        "project.restore", {"id": project["id"], "revision_id": first}
    )
    assert restored["revision_count"] == 3 and restored["model"]["size_mm"][2] == 80
    package = service.call("project.export", {"id": project["id"], "format": "usagi"})
    imported = service.call(
        "project.import",
        {
            "base64": base64.b64encode(
                service.assets.path(package["id"]).read_bytes()
            ).decode()
        },
    )
    assert (
        imported["id"] != project["id"]
        and imported["model"]["size_mm"] == restored["model"]["size_mm"]
    )


@pytest.mark.parametrize("mode", ["silhouette", "relief"])
def test_images_become_closed_actual_mesh(service, mode):
    asset = image_asset(service)
    mesh = generate_local(
        DesignSpec(mode=mode, asset_ids=[asset["id"]], thickness_mm=3), service.assets
    )
    assert mesh.is_watertight and mesh.volume > 0
    assert np.isclose(mesh.extents[1], 3)


def test_settings_keys_not_exposed_and_quota(service, monkeypatch):
    monkeypatch.setenv("MESHY_API_KEY", "not-a-real-secret")
    token = service.settings.unlock("123456")["token"]
    public = service.settings.update(token, {"cloud_enabled": True, "daily_limit": 1})
    assert public["meshy_configured"] and "not-a-real-secret" not in str(public)
    service.settings.reserve_cloud("meshy")
    with pytest.raises(DomainError):
        service.settings.reserve_cloud("meshy")
    with pytest.raises(DomainError):
        service.settings.update("bad", {"daily_limit": 2})


def test_asset_paths_and_disabled_cloud(service):
    with pytest.raises(DomainError):
        service.assets.path("../../private")
    project = service.bootstrap()["projects"][0]
    job = wait(
        service,
        service.generate(project["id"], project["spec"] | {"provider": "meshy"}),
    )
    assert job["status"] == "failed" and job["error_code"] == "AI_DISABLED"
    assert service.projects.get(project["id"])["revision_id"] == project["revision_id"]


def test_oversize_model_fails_space_check(service):
    project = service.bootstrap()["projects"][0]
    job = wait(
        service, service.generate(project["id"], project["spec"] | {"height_mm": 220})
    )
    assert job["status"] == "succeeded"
    report = service.call(
        "model.check", {"id": project["id"], "profile": PrintProfile().model_dump()}
    )["validation"]
    assert not report["can_prepare"] and report["items"][0]["status"] == "fail"


def test_profile_change_invalidates_check(service):
    project = service.bootstrap()["projects"][0]
    service.call(
        "model.check", {"id": project["id"], "profile": PrintProfile().model_dump()}
    )
    service.call("profile.save", {"profile": PrintProfile(layer_mm=0.16).model_dump()})
    assert service.projects.get(project["id"])["validation"] is None


def test_local_adjustments_use_original_mesh_and_can_remove_hole(service):
    project = service.bootstrap()["projects"][0]
    first = wait(
        service, service.generate(project["id"], project["spec"] | {"hole": True})
    )
    assert first["status"] == "succeeded"
    current = first["result"]["project"]
    plain = wait(
        service,
        service.generate(project["id"], current["spec"] | {"hole": False}, adjust=True),
    )
    assert plain["status"] == "succeeded"
    assert (
        plain["result"]["project"]["model"]["volume_mm3"]
        > current["model"]["volume_mm3"]
    )
    assert (
        plain["result"]["project"]["model"]["source_stl_id"]
        == current["model"]["source_stl_id"]
    )


def test_late_task_does_not_replace_restored_version(service, monkeypatch):
    import threading
    import yaha.generation as module

    project = service.bootstrap()["projects"][0]
    entered = threading.Event()
    release = threading.Event()
    original = module.generate_local

    def delayed(*args, **kwargs):
        entered.set()
        release.wait(5)
        return original(*args, **kwargs)

    monkeypatch.setattr(module, "generate_local", delayed)
    job = service.generate(project["id"], project["spec"] | {"height_mm": 120})
    assert entered.wait(3)
    restored = service.call(
        "project.restore", {"id": project["id"], "revision_id": project["revision_id"]}
    )
    release.set()
    result = wait(service, job)
    assert result["status"] == "failed" and result["error_code"] == "REVISION_CHANGED"
    assert service.projects.get(project["id"])["revision_id"] == restored["revision_id"]
