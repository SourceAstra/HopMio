import base64
import io
import json
import time
from types import SimpleNamespace
import numpy as np
import pytest
from PIL import Image, ImageDraw
from yaha.service import Service
from yaha.contracts import DesignSpec, PrintProfile, DomainError
from yaha.geometry.models import load_mesh
from yaha.modeling.measurement import hits


@pytest.fixture
def service(tmp_path):
    instance = Service(tmp_path)
    yield instance
    instance.close()


def wait(service, job):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        value = service.jobs.get(job["id"])
        if value["status"] not in ("queued", "running"):
            return value
        time.sleep(0.1)
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
    spec=DesignSpec(mode=mode, asset_ids=[asset["id"]], thickness_mm=3)
    project=service.projects.create('图片几何验收',spec.model_dump())
    job=wait(service,service.generate(project['id'],spec.model_dump()))
    assert job['status']=='succeeded', job
    mesh=load_mesh(service.assets.path(job['result']['project']['model']['stl_id']))
    assert mesh.is_watertight and mesh.volume > 0
    assert np.isclose(mesh.extents[1], 3)


def test_settings_keys_not_exposed_and_quota(service, monkeypatch):
    monkeypatch.setenv("YAHA_AI_API_KEY", "not-a-real-secret")
    public = service.settings.update("", {"cloud_enabled": True, "daily_limit": 1})
    assert public["chat_configured"] and "not-a-real-secret" not in str(public)
    service.settings.reserve_cloud("chat")
    with pytest.raises(DomainError):
        service.settings.reserve_cloud("chat")
    assert service.settings.update("", {"daily_limit": 2})["daily_limit"] == 2


def test_asset_paths_and_disabled_cloud(service):
    with pytest.raises(DomainError):
        service.assets.path("../../private")
    project = service.bootstrap()["projects"][0]
    service.planner=SimpleNamespace(design=lambda *args,**kwargs:service.settings.reserve_cloud('chat'))
    job = wait(
        service,
        service.generate(project["id"], project["spec"] | {"provider": "parametric"}),
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


def test_local_regeneration_does_not_accumulate_holes(service):
    project = service.bootstrap()["projects"][0]
    first = wait(
        service, service.generate(project["id"], project["spec"] | {"hole": True})
    )
    assert first["status"] == "succeeded"
    current = first["result"]["project"]
    manifest=json.loads(service.assets.path(current['model']['manifest_id']).read_text())
    hole=manifest['finishing']['hole']
    assert hole['removed_volume_mm3'] > 1
    actual=load_mesh(service.assets.path(current['model']['stl_id']))
    actual.apply_translation(-np.asarray(manifest['export_shift_m'])*1000)
    origin=np.asarray(hole['center_mm']); origin[1]=actual.bounds[0,1]-1
    assert not hits(actual,origin,np.array([0.,1.,0.]))
    original_bytes=service.assets.path(current['model']['stl_id']).read_bytes()
    plain = wait(
        service,
        service.generate(project["id"], current["spec"] | {"hole": False}),
    )
    assert plain["status"] == "succeeded"
    assert (
        plain["result"]["project"]["model"]["volume_mm3"]
        > current["model"]["volume_mm3"]
    )
    assert service.assets.path(current['model']['stl_id']).read_bytes()==original_bytes


def test_late_task_does_not_replace_restored_version(service, monkeypatch):
    import threading

    project = service.bootstrap()["projects"][0]
    entered = threading.Event()
    release = threading.Event()
    original = service.modeler.build

    def delayed(*args, **kwargs):
        entered.set()
        release.wait(10)
        return original(*args, **kwargs)

    monkeypatch.setattr(service.modeler, "build", delayed)
    job = service.generate(project["id"], project["spec"] | {"height_mm": 120})
    assert entered.wait(3)
    restored = service.call(
        "project.restore", {"id": project["id"], "revision_id": project["revision_id"]}
    )
    release.set()
    result = wait(service, job)
    assert result["status"] == "failed" and result["error_code"] == "REVISION_CHANGED"
    assert service.projects.get(project["id"])["revision_id"] == restored["revision_id"]
