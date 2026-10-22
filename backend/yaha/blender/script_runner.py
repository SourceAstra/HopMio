"""仅在外部脚本隔离进程执行；导出几何后退出，不生成可信清单。"""

import ast
import json
from pathlib import Path
from types import SimpleNamespace
import bpy


def main():
    document = json.loads(Path("/input/request.json").read_text(encoding="utf-8"))
    scale = 0.001 if document["coordinate_unit"] == "mm" else 1
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = scale
    current = None
    if document["operation"] == "edit":
        source = json.loads(Path("/input/source.json").read_text(encoding="utf-8"))
        mesh = bpy.data.meshes.new("Current_Model_Mesh")
        mesh.from_pydata([[value / (1000 * scale) for value in point] for point in source["vertices"]], [], source["faces"])
        mesh.update()
        current = bpy.data.objects.new("Current_Model", mesh)
        bpy.context.collection.objects.link(current)
        current.select_set(True)
        bpy.context.view_layer.objects.active = current
    tree = ast.parse(Path("/input/script.py").read_text(encoding="utf-8"), filename="script.py")
    # 参数面板的数值覆盖声明默认值，兼容顶层直接调用的现有脚本。
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        if any(isinstance(target, ast.Name) and target.id == "PARAMETERS" for target in targets):
            node.value = ast.parse(repr(document["parameters"]), mode="eval").body
    ast.fix_missing_locations(tree)
    ctx = SimpleNamespace(current=current, coordinate_unit=document["coordinate_unit"])
    namespace = {"__name__": "__main__", "__file__": "script.py", "ctx": ctx, "PARAMETERS": document["parameters"]}
    exec(compile(tree, "script.py", "exec"), namespace)
    result = None
    if document["entrypoint"] == "build":
        factory = namespace.get("build")
        if not callable(factory):
            raise ValueError("请选择直接运行脚本，或定义 build(ctx, params) 函数")
        result = factory(ctx, document["parameters"])
        if result is None:
            raise ValueError("build(ctx, params) 必须返回最终网格对象或对象列表")
    objects = list(result) if isinstance(result, (list, tuple)) else [result] if result is not None else [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects or any(not isinstance(obj, bpy.types.Object) or obj.type != "MESH" for obj in objects):
        raise ValueError("脚本须生成网格；build(ctx, params) 须返回网格对象或对象列表")
    bpy.context.view_layer.update()
    vertices, faces = [], []
    for obj in dict.fromkeys(objects):
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            offset = len(vertices)
            vertices.extend([list((evaluated.matrix_world @ vertex.co) * scale * 1000) for vertex in mesh.vertices])
            faces.extend([[offset + index for index in face.vertices] for face in mesh.loop_triangles])
            if len(faces) > 200_000 or len(vertices) > 600_000:
                raise ValueError("模型超过网格预算，请降低细分精度")
        finally:
            evaluated.to_mesh_clear()
    Path("/output/candidate.json").write_text(json.dumps({"vertices": vertices, "faces": faces}, allow_nan=False), encoding="utf-8")


main()
