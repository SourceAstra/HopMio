"""导出未加底座的真实造型数据，只供本地轮廓拟合。"""

import json
import bpy


def capture(body, directory):
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        data = {"vertices": [list(body.matrix_world @ vertex.co * 1000) for vertex in mesh.vertices], "faces": [list(face.vertices) for face in mesh.loop_triangles]}
        (directory / "shape-body.json").write_text(json.dumps(data), encoding="utf-8")
    finally:
        evaluated.to_mesh_clear()
