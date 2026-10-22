import time
from types import SimpleNamespace
import numpy as np
import pytest
import trimesh
from yaha.contracts import DesignSpec, ModelAdjustment, DomainError
from yaha.modeling.geometry_review import geometry_digest, review_geometry
from yaha.modeling.design_review import adjustment_accepted
from yaha.modeling.photo_quality import photo_completion
from yaha.modeling.contracts import GeometryPlan, GeometryStep
from yaha.modeling.backend import BuildResult
from yaha.service import Service


def box_spec():
    spec = DesignSpec(provider='parametric', prompt='开口长方形收纳盒，宽100深50高50毫米', width_mm=100, depth_mm=50, height_mm=50)
    spec.modeling_plan = GeometryPlan.model_validate({
        'schema_version': 6, 'title': '参数收纳盒', 'source_prompt': spec.prompt, 'parameters': {'width': {'value':100, 'label':'宽度'}},
        'steps': [
            {'id': 'outer_box', 'name': '盒身', 'shape': 'box', 'size_mm': [{'parameter':'width'},50,50], 'center_mm': [0,0,25], 'coordinate_origin': 'bounds_center'},
            {'id': 'cavity', 'name': '内腔', 'shape': 'box', 'size_mm': [94,44,50], 'center_mm': [0,0,3], 'operation': 'subtract', 'relative_to': 'outer_box', 'coordinate_origin': 'bounds_center'},
        ],
        'constraints': [{'feature': 'model.' + axis, 'expected_mm': value} for axis, value in zip(('width','depth','height'), (100,50,50))],
    })
    return spec


def job_stub():
    return SimpleNamespace(check=lambda: None, progress=lambda *args: None, record=lambda **kwargs: None)


def test_geometry_comparison_ignores_mesh_face_order():
    mesh = trimesh.creation.box()
    reordered = trimesh.Trimesh(vertices=mesh.vertices.copy(), faces=mesh.faces[::-1, ::-1], process=False)
    assert geometry_digest(mesh) == geometry_digest(reordered)
    moved = mesh.copy(); moved.apply_translation([1,0,0])
    assert geometry_digest(mesh) != geometry_digest(moved)


def test_unreviewed_observed_surface_is_saved_as_draft():
    result = photo_completion(None, {"status": "observed_surface", "appearance_status": "unverified"})
    assert result == {"status": "draft", "message": "待改进草稿已保存，真实扫描表面尚未通过照片外观验收。"}
    assert photo_completion(None, {"status": "observed_surface", "appearance_status": "accepted"})["status"] == "completed"


def test_local_review_cannot_claim_visual_acceptance_or_accept_noop(tmp_path):
    mesh = trimesh.creation.box()
    previous = tmp_path / 'previous.stl'; mesh.export(previous)
    service = SimpleNamespace(assets=SimpleNamespace(path=lambda _: previous))
    built = BuildResult({'stl': previous.read_bytes()}, {'geometry_check': {'watertight': True, 'is_volume': True}})
    measurements = [{'status': 'pass', 'feature': 'model.width', 'measured_mm': 1}]
    with pytest.raises(DomainError) as error:
        review_geometry(service, box_spec(), (built, mesh, measurements), {'model': {'stl_id': 'old'}}, job_stub(), require_change=True)
    assert error.value.code == 'AI_ADJUSTMENT_UNCHANGED'
    review_geometry(service, box_spec(), (built, mesh, measurements), {'model': None}, job_stub())
    report = built.manifest['design_review']
    assert report['status'] == 'geometry_verified' and report['visual_status'] == 'unverified'
    assert adjustment_accepted(report)
    assert photo_completion(report)['status'] == 'completed'
    with pytest.raises(DomainError):
        review_geometry(service, box_spec(), (built, mesh, [{'status': 'fail'}]), {'model': None}, job_stub())


def test_lettering_requires_actual_boolean_evidence():
    spec = box_spec()
    spec.modeling_plan.steps.append(GeometryStep.model_validate({'id':'word', 'name':'文字', 'shape':'text', 'text':'Usagi', 'operation':'subtract', 'size_mm':[50,12,5], 'coordinate_origin':'bounds_center'}))
    mesh = trimesh.creation.box()
    built = BuildResult({'stl': b'test'}, {'geometry_check': {'watertight':True, 'is_volume':True}})
    with pytest.raises(DomainError) as error:
        review_geometry(SimpleNamespace(), spec, (built,mesh,[{'status':'pass'}]), {'model':None}, job_stub())
    assert error.value.code == 'AI_ADJUSTMENT_LETTERING'


def wait(service, job):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        value = service.jobs.get(job['id'])
        if value['status'] not in ('queued','running'):
            assert value['status'] == 'succeeded', value.get('message')
            return value['result']['project']
        time.sleep(0.1)
    pytest.fail('真实 Blender 建模任务超时')


def test_text_only_adjustment_executes_real_blender_without_cloud_or_images(tmp_path):
    from yaha.modeling.runtime import availability
    if not availability()['available']:
        pytest.skip('未安装 Blender')
    calls = []
    def adjust(spec, images, instruction, preview, observer, *, location_image=None):
        calls.append((images, preview, location_image))
        plan = spec.modeling_plan.model_copy(deep=True)
        plan.steps.append(GeometryStep.model_validate({'id':'word', 'name':'Usagi镂空文字', 'shape':'text', 'text':'Usagi', 'operation':'subtract', 'size_mm':[55,13,5], 'center_mm':[0,-24.9,0], 'rotation_deg':[90,0,0], 'relative_to':'outer_box', 'coordinate_origin':'bounds_center'}))
        return plan
    service = Service(tmp_path, planner=SimpleNamespace(), editor=SimpleNamespace(adjust=adjust))
    service.settings.public = lambda: {'chat_supports_images': False}
    try:
        spec = box_spec()
        project = service.projects.create('隔离回归样本', spec.model_dump())
        before = wait(service, service.generate(project['id'], spec.model_dump()))
        service.projects.update(project['id'], validation={'can_prepare':True}, slicing={'status':'test-old-slice'})
        result = wait(service, service.generate(project['id'], before['spec'], adjustment=ModelAdjustment(instruction='盒子侧面镂空文字“Usagi”，正中居中，其他保持不变', target_part_id='outer_box')))
        assert calls == [([],None,None)]
        assert result['revision_count'] == before['revision_count'] + 1
        assert result['validation'] is None and result['slicing'] is None
        assert result['model']['stl_id'] != before['model']['stl_id']
        report = result['model']['design_review']
        assert report['status'] == 'geometry_verified' and report['visual_status'] == 'unverified'
        effects = report['evidence'][0]['lettering_effects']
        assert effects[0]['text'] == 'Usagi' and effects[0]['volume_change_mm3'] > 0
        assert np.allclose(result['model']['size_mm'], [100,50,50], atol=.05)
        assert service.projects.get(project['id'])['revision_id'] == result['revision_id']
    finally:
        service.close()
