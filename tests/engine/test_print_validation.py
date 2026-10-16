from types import SimpleNamespace
import trimesh
from yaha.contracts import PrintProfile
from yaha.validation import inspect


def test_floating_letter_islands_are_distinguished_from_watertight_mesh(tmp_path):
    body = trimesh.creation.box(extents=[50,100,3]); body.apply_translation([0,0,1.5])
    islands = []
    for x in [-10,10]:
        island = trimesh.creation.box(extents=[3,3,3]); island.apply_translation([x,0,25])
        islands.append(island)
    path = tmp_path / 'islands.stl'
    trimesh.util.concatenate([body,*islands]).export(path)
    report = inspect({'revision_id':'new','model':{'stl_id':'isolated'}}, SimpleNamespace(path=lambda _:path), PrintProfile())
    assert report['can_prepare']  # 可以交给切片软件检查，未宣称可以直接打印。
    part = next(item for item in report['items'] if item['name']=='独立部件')
    assert part['status']=='warn' and '2 个部件悬空' in part['detail']
    assert '支撑不会自动' in part['detail']
