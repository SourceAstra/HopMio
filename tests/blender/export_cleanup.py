"""真实 Blender 导出快照回归，由引擎测试以子进程调用。"""
import json
from pathlib import Path
import sys
import bpy

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'backend/yaha/blender'))
from exporting import export_scene

arguments = sys.argv[sys.argv.index('--') + 1:]
destination, island_size = Path(arguments[0]), float(arguments[1])
bpy.ops.mesh.primitive_cube_add(size=0.01)
body = bpy.context.object
if '--cavity' in arguments:
    from tools import boolean
    bpy.ops.mesh.primitive_cube_add(size=0.005)
    boolean(body, bpy.context.object, 'DIFFERENCE')
bpy.ops.mesh.primitive_cube_add(size=island_size, location=(0.02, 0, 0))
island = bpy.context.object
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
bpy.context.scene['yaha_plan'] = '{}'
try:
    export_scene(body, destination, 10000, {}, max_removed_ratio=0.02)
    result = json.loads(bpy.context.scene['yaha_export_cleanup'])
except ValueError as error:
    result = {'error': str(error)}
(destination / 'cleanup-result.json').write_text(json.dumps(result))
