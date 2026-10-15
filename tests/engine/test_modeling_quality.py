"""实际缺陷回归：明确需求、修改范围、字体和真实制造产物。"""

import uuid
from types import SimpleNamespace
import pytest
from yaha.contracts import DesignSpec, DomainError
from yaha.modeling.contracts import GeometryPlan
from yaha.modeling.compiler import compile_plan
from yaha.modeling.intent import validate_intent
from yaha.modeling.adjusting import validate_scope
from yaha.modeling.preparing import prepare
from yaha.modeling.blender_backend import BlenderBackend
from yaha.modeling.measurement import verify, hits
from yaha.modeling.photo_strategy import select_photo_route, build_photo_result
from yaha.modeling.design_review import review_design, DesignAssessment
from yaha.modeling.backend import BuildResult
from yaha.service import Service
import numpy as np
from PIL import Image
import io
import math
import base64
import zipfile
import json
import struct
from yaha.exporting import export_project
from yaha.importing import import_package
from yaha.geometry.models import load_mesh
import trimesh
import yaha.reconstruction.backend as surface_backend


@pytest.mark.parametrize('data,provider', [({},'local'),({'mode':'relief'},'local'),({'mode':'image','provider':'reconstruction'},'reconstruction'),({'schema_version':1,'provider':'meshy'},'parametric')])
def test_spec_migration_preserves_current_provider_and_declared_default(data,provider):
    assert DesignSpec.model_validate(data).provider==provider


def keychain():
    spec = DesignSpec(provider='parametric', template='plaque', prompt='名字钥匙扣，刻上“何志川”，顶部圆孔，四周圆角。', width_mm=28, height_mm=50, depth_mm=3)
    spec.modeling_plan = GeometryPlan.model_validate({
        'title': '真实文字圆角挂牌', 'source_prompt': spec.prompt,
        'parameters': {'width': {'value': 28, 'label': '宽度'}},
        'steps': [
            {'id': 'body', 'name': '圆角牌面', 'shape': 'rounded_box', 'coordinate_origin': 'bounds_center', 'size_mm': [{'parameter': 'width'}, 50, 3], 'corner_radius_mm': 4, 'bevel_mm': 0.6, 'rotation_deg': [90,0,0], 'center_mm': [0,0,25]},
            {'id': 'hole', 'name': '挂绳圆孔', 'shape': 'cylinder', 'operation': 'subtract', 'coordinate_origin': 'bounds_center', 'size_mm': [4,4,7], 'rotation_deg': [90,0,0], 'center_mm': [0,0,44]},
            {'id': 'name', 'name': '姓名凹刻', 'shape': 'text', 'text': '何志川', 'operation': 'subtract', 'coordinate_origin': 'bounds_center', 'size_mm': [22,8,1], 'rotation_deg': [90,0,0], 'center_mm': [0,-1.4,22]},
        ],
        'constraints': [{'feature': 'model.width', 'expected_mm': {'parameter':'width'}}, {'feature':'model.depth','expected_mm':3}, {'feature':'model.height','expected_mm':50}],
    })
    return spec


def test_description_cannot_replace_actual_lettering():
    spec = keychain()
    spec.modeling_plan.steps.pop()
    spec.modeling_plan.assumptions = ['执行器会刻上何志川']
    with pytest.raises(DomainError, match='真实建模'):
        validate_intent(spec, spec.modeling_plan, compile_plan(spec.modeling_plan))


def test_world_axis_cutter_dimensions_do_not_count_as_round():
    spec = keychain()
    spec.modeling_plan.steps[1].size_mm = (4,9,4)
    with pytest.raises(DomainError, match='旋转前'):
        validate_intent(spec, spec.modeling_plan, compile_plan(spec.modeling_plan))


def test_targeted_adjustment_rejects_changes_to_existing_hole():
    original = keychain().modeling_plan
    changed = original.model_copy(deep=True)
    changed.steps[1].size_mm = (6,6,7)
    with pytest.raises(DomainError, match='之外'):
        validate_scope(original, changed, 'name')


def test_corner_radius_is_independent_of_thin_plate_thickness():
    spec = keychain()
    compiled = compile_plan(spec.modeling_plan)
    assert compiled['steps'][0]['corner_radius_mm'] == 4
    assert compiled['steps'][0]['size_mm'][2] == 3
    validate_intent(spec, spec.modeling_plan, compiled)


def test_photo_auto_requires_observations_and_never_falls_back():
    scan = SimpleNamespace(status=lambda: {'available': True, 'min_photos':3, 'max_photos':96})
    service = SimpleNamespace(modelers={'reconstruction':scan})
    spec = DesignSpec(mode='image', provider='parametric', asset_ids=['one'])
    with pytest.raises(DomainError, match='深度与背面'):
        select_photo_route(service, spec, True)
    spec.asset_ids = ['one','two','three']
    route = select_photo_route(service, spec, True)
    attempts = []
    def fail(source):
        attempts.append(source.provider)
        raise DomainError('观测失败', 'RECONSTRUCTION_FAILED')
    job = SimpleNamespace(record=lambda **kwargs: None)
    with pytest.raises(DomainError, match='观测失败'):
        build_photo_result(spec, route, job, fail)
    assert attempts == ['reconstruction']


@pytest.mark.parametrize('instruction, expected', [(None,'accepted'),('放大名字','draft_retained')])
def test_preservation_gate_only_applies_to_actual_adjustments(instruction, expected):
    findings={name:{'status':'pass','observation':'当前实际模型具有满足要求的图像依据。'} for name in ('identity','features','lettering','adjustment','preservation')}
    findings['preservation']={'status':'unverified','observation':'没有修改前图片，无法对比原有区域。'}
    assessor=SimpleNamespace(assess=lambda *args,**kwargs:DesignAssessment.model_validate(findings))
    service=SimpleNamespace(design_assessor=assessor,reviewer=None)
    built=BuildResult({'stl':b'mesh-identity','comparison':b'actual-preview'}, {})
    job=SimpleNamespace(check=lambda:None,record=lambda **kwargs:None,progress=lambda *args:None)
    _,result=review_design(service,keychain(),(built,None,None),{'model':None},job,adjustment={'instruction':instruction} if instruction else None)
    assert result[0].manifest['design_review']['status']==expected


def test_empty_workspace_welcome_uses_trusted_mesh_and_real_glb(tmp_path):
    service = Service(tmp_path)
    try:
        projects=service.bootstrap()['projects']
        assert len(projects)==1 and projects[0]['spec']['template']=='usagi'
        model=projects[0]['model']
        from yaha.geometry.models import load_mesh
        stl=load_mesh(service.assets.path(model['stl_id']))
        glb=load_mesh(service.assets.path(model['glb_id']))
        content=service.assets.path(model['glb_id']).read_bytes()
        document=json.loads(content[20:20+struct.unpack_from('<I',content,12)[0]])
        assert document['scenes'][document.get('scene',0)].get('extras',{}).get('yaha_units')=='m'
        glb.apply_transform(np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]]))
        assert np.allclose(glb.extents*1000, stl.extents, atol=0.01)
        assert '内置示例' in model['origin']
        assert service.bootstrap()['projects'][0]['revision_count']==1
    finally:
        service.close()


def test_real_blender_name_plate_hole_and_shared_exports(tmp_path):
    backend = BlenderBackend()
    if not backend.status()['available']:
        pytest.skip(backend.status()['message'])
    spec = keychain()
    request, inputs, plan = prepare(spec, None)
    request.update(source_plan=plan.model_dump(), preview_views=True)
    job = SimpleNamespace(id='quality-'+uuid.uuid4().hex[:12], check=lambda:None, record=lambda **kwargs:None, progress=lambda *args:None)
    built = backend.build(request, inputs, job)
    path = tmp_path / 'name-keychain.stl'
    path.write_bytes(built.files['stl'])
    mesh, measurements = verify(path, built.manifest, request['plan']['constraints'])
    assert len(mesh.split()) == 1
    assert all(item['status']=='pass' for item in measurements)
    assert built.manifest['lettering_effects'][0]['text'] == '何志川'
    assert built.manifest['lettering_effects'][0]['volume_change_mm3'] > 1
    assert not hits(mesh, np.array([0.,-5.,44.]), np.array([0.,1.,0.]))
    radial = hits(mesh, np.array([0.,0.,44.]), np.array([1.,0.,0.]))
    assert radial[0] == pytest.approx(2, abs=0.01)
    assert 'comparison' in built.files and 'manufacturing_glb' in built.files
    assert Image.open(io.BytesIO(built.files['comparison'])).size == (1536,1024)
    assert [view['position'] for view in built.manifest['review_views']] == ['front','right','back','left','front-right','back-left']
    service=Service(tmp_path/'roundtrip')
    try:
        stored={role:service.assets.write(content,built.manifest['outputs'][role]['extension'],role,'model',units=built.manifest['units'][role]) for role,content in built.files.items()}
        model={role+'_id':asset['id'] for role,asset in stored.items()}
        model.update(preview_units='m',size_mm=mesh.extents.tolist(),design_review={'schema_version':'yaha.design-review/v1','status':'draft_retained','scope':'design_intent','message':'本测试不调用外观 AI，造型尚未审阅。'})
        project=service.projects.create('真实制造文件往返',spec.model_dump())
        first=service.projects.revision(project['id'],spec.model_dump(),model,'首次生成')
        assert export_project(first,service.assets,'glb')['sha256']==stored['manufacturing_glb']['sha256']
        glb=load_mesh(service.assets.path(stored['manufacturing_glb']['id']))
        # glTF Y-up 转回制造 Z-up 后，几何、单位与 STL 一致。
        glb.apply_transform(np.array([[1,0,0,0],[0,0,-1,0],[0,1,0,0],[0,0,0,1]]))
        glb.apply_scale(1000)
        assert np.allclose(glb.bounds,mesh.bounds,atol=0.001)
        assert glb.volume==pytest.approx(mesh.volume,rel=1e-5)
        exported=export_project(first,service.assets,'3mf')
        mf=load_mesh(service.assets.path(exported['id']))
        assert np.allclose(mf.bounds,mesh.bounds,atol=0.001)
        package=export_project(first,service.assets,'usagi')
        content=service.assets.path(package['id']).read_bytes()
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            assert archive.read('model.glb')==built.files['manufacturing_glb']
        imported=import_package(base64.b64encode(content).decode(),service.assets,service.projects)
        assert imported['model']['design_review']['status']=='draft_retained'
        assert service.assets.path(imported['model']['stl_id']).read_bytes()==built.files['stl']
        first['model']['design_review']['status']='accepted'
        accepted_package=export_project(first,service.assets,'usagi')
        restored_accepted=import_package(base64.b64encode(service.assets.path(accepted_package['id']).read_bytes()).decode(),service.assets,service.projects)
        assert restored_accepted['model']['design_review']['status']=='draft_retained'
        assert restored_accepted['model']['design_review']['previous_reviews']['design_review']['status']=='accepted'
        service.projects.update(project['id'],validation={'revision_id':first['revision_id']},slicing={'revision_id':first['revision_id']})
        second=service.projects.revision(project['id'],spec.model_dump(),model,'下一版本')
        assert second['validation'] is None and second['slicing'] is None
        restored=service.projects.restore(project['id'],first['revision_id'])
        assert restored['revision_count']==3 and restored['model']['stl_id']==model['stl_id']
        assert {r['id'] for r in service.projects.history(project['id'])} >= {first['revision_id'],second['revision_id']}
    finally:
        service.close()


def build_mesh(plan, tmp_path):
    backend = BlenderBackend()
    if not backend.status()['available']:
        pytest.skip(backend.status()['message'])
    job = SimpleNamespace(id='quality-'+uuid.uuid4().hex[:12], check=lambda:None, record=lambda **kwargs:None, progress=lambda *args:None)
    built = backend.build({'plan':compile_plan(plan)}, {}, job)
    path = tmp_path / 'actual.stl'
    path.write_bytes(built.files['stl'])
    mesh, _ = verify(path, built.manifest, [])
    mesh.apply_translation(-np.asarray(built.manifest['export_shift_m']) * 1000)
    return mesh


def test_nested_local_hole_stays_round_on_tilted_plate(tmp_path):
    plan = GeometryPlan.model_validate({'title':'倾斜板局部孔','parameters':{'diameter':{'value':6,'label':'孔径'}}, 'steps':[
        {'id':'plate','name':'倾斜板','shape':'rounded_box','coordinate_origin':'bounds_center','size_mm':[40,30,4], 'corner_radius_mm':3, 'center_mm':[17,-8,30], 'rotation_deg':[37,23,19]},
        {'id':'hole','name':'局部圆孔','shape':'cylinder','coordinate_origin':'bounds_center','size_mm':[{'parameter':'diameter'},{'parameter':'diameter'},10], 'operation':'subtract','relative_to':'plate','center_mm':[7,3,0]},
    ]})
    mesh = build_mesh(plan, tmp_path)
    # 独立解析旋转矩阵：先绕 X，再 Y，最后 Z；在板的局部坐标复测实体。
    x,y,z = map(math.radians,(37,23,19))
    rx=np.array([[1,0,0],[0,math.cos(x),-math.sin(x)],[0,math.sin(x),math.cos(x)]])
    ry=np.array([[math.cos(y),0,math.sin(y)],[0,1,0],[-math.sin(y),0,math.cos(y)]])
    rz=np.array([[math.cos(z),-math.sin(z),0],[math.sin(z),math.cos(z),0],[0,0,1]])
    world=np.eye(4); world[:3,:3]=rz@ry@rx; world[:3,3]=[17,-8,30]
    mesh.apply_transform(np.linalg.inv(world))
    assert np.allclose(mesh.extents,[40,30,4],atol=0.001)
    assert not hits(mesh,np.array([7.,3.,-10.]),np.array([0.,0.,1.]))
    for direction in (np.array([1.,0.,0.]),np.array([0.,1.,0.])):
        assert hits(mesh,np.array([7.,3.,0.]),direction)[0] == pytest.approx(3,abs=0.006)
    assert hits(mesh,np.array([0.,0.,-10.]),np.array([0.,0.,1.])) == pytest.approx([8,12],abs=0.001)


@pytest.mark.parametrize('schema,parent', [(5,'plate'),(6,'later'),(6,'hole')])
def test_relative_frames_reject_legacy_forward_and_self_references(schema,parent):
    plan=GeometryPlan.model_validate({'schema_version':schema,'title':'错误坐标引用','parameters':{'width':{'value':20,'label':'板宽'}},'steps':[
        {'id':'plate','name':'板','shape':'box','coordinate_origin':'bounds_center','size_mm':[{'parameter':'width'},20,3]},
        {'id':'hole','name':'孔','shape':'cylinder','coordinate_origin':'bounds_center','size_mm':[3,3,8],'operation':'subtract','relative_to':parent},
    ]})
    with pytest.raises(DomainError,match='更早'):
        compile_plan(plan)


def test_targeted_parent_adjustment_preserves_independent_geometry():
    previous=keychain().modeling_plan
    previous.steps[1].relative_to='body'
    previous.steps[1].rotation_deg=(0,0,0)
    previous.steps[1].center_mm=(0,19,0)
    changed=previous.model_copy(deep=True)
    changed.steps[0].rotation_deg=(75,0,0)
    validate_scope(previous,changed,'body')
    changed.steps[2].center_mm=(0,-1.4,23)
    with pytest.raises(DomainError,match='之外'):
        validate_scope(previous,changed,'body')


def test_targeted_adjustment_rejects_unbound_new_geometry():
    previous=keychain().modeling_plan
    changed=previous.model_copy(deep=True)
    changed.steps.append(previous.steps[1].model_copy(update={'id':'new_hole','center_mm':(0,0,15)}))
    with pytest.raises(DomainError,match='之外'):
        validate_scope(previous,changed,'body')
    changed.steps[-1].relative_to='body'
    validate_scope(previous,changed,'body')


def test_round_sweep_cap_respects_surface_error_budget(tmp_path):
    plan=GeometryPlan.model_validate({'title':'通用圆润扫掠端帽','parameters':{'diameter':{'value':30,'label':'直径'}},'steps':[
        {'id':'body','name':'圆润实体','shape':'sweep','coordinate_origin':'local_origin','path':[
            {'position_mm':[0,-17,0],'width_mm':{'parameter':'diameter'},'depth_mm':{'parameter':'diameter'}},
            {'position_mm':[0,17,0],'width_mm':{'parameter':'diameter'},'depth_mm':{'parameter':'diameter'}},
        ]},
    ]})
    mesh=build_mesh(plan,tmp_path)
    errors=[]
    for angle in np.linspace(0.01,math.pi/2-0.01,48):
        direction=np.array([0.,math.cos(angle),math.sin(angle)])
        distance=hits(mesh,np.array([0.,17.,0.]),direction)[0]
        errors.append(abs(15-distance))
    assert max(errors) <= 0.025, f'真实端帽曲面误差 {max(errors):.5f} mm 超过预算'


def test_nontext_carving_outside_curved_surface_cannot_succeed(tmp_path):
    plan=GeometryPlan.model_validate({'title':'曲面雕刻未接触复现','parameters':{'width':{'value':34,'label':'曲面宽'}},'steps':[
        {'id':'body','name':'曲面主体','shape':'ellipsoid','coordinate_origin':'bounds_center','size_mm':[{'parameter':'width'},40,32]},
        {'id':'detail','name':'浅刻细节','shape':'ellipsoid','coordinate_origin':'bounds_center','size_mm':[2,6,2],'center_mm':[16,0,-10],'operation':'subtract','relative_to':'body'},
    ]})
    with pytest.raises(DomainError,match='未改变实际实体体积'):
        build_mesh(plan,tmp_path)


@pytest.mark.parametrize('point_count',[0,4])
def test_dense_output_gate_stops_empty_cloud_before_meshing(tmp_path,monkeypatch,point_count):
    (tmp_path/'camera.json').write_text('{}')
    (tmp_path/'quality.json').write_text(json.dumps({'registered_views':6,'input_views':15}))
    calls=[]
    class ReachedMesh(Exception):
        pass
    def run(command,root,stage,deadline,job):
        calls.append(stage)
        if stage=='ReconstructMesh':
            raise ReachedMesh()
        if stage=='DensifyPointCloud':
            (root/'dense.mvs').write_bytes(b'nonempty-scene-with-zero-or-more-points')
            if point_count:
                cloud=trimesh.PointCloud([[0,0,0],[1,0,0],[0,1,0],[0,0,1]])
                (root/'dense.ply').write_bytes(cloud.export(file_type='ply'))
    monkeypatch.setattr(surface_backend,'run',run)
    job=SimpleNamespace(check=lambda:None,record=lambda **kwargs:None,tool_record=lambda *args,**kwargs:None,progress=lambda *args:None)
    stages=[('DensifyPointCloud',55,'稠密重建',['-o','dense.mvs']),('ReconstructMesh',65,'建立网格',['-o','mesh.mvs'])]
    with pytest.raises(ReachedMesh if point_count else DomainError) as error:
        surface_backend.SurfaceBackend(None)._observe(tmp_path,{'threads':1},{name:name for name,_,_,_ in stages},stages,b'',float('inf'),job)
    if not point_count:
        assert error.value.code=='RECONSTRUCTION_DENSE'
        assert 'ReconstructMesh' not in calls
    else:
        assert 'ReconstructMesh' in calls
