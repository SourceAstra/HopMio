"""真实字体曲线挤出；保持字形比例，禁止用几何笔画猜汉字。"""

import bpy
import bmesh


def lettering(step):
    from tools import activate
    curve = bpy.data.curves.new(step["name"], type="FONT")
    curve.body = step["text"]
    curve.font = bpy.data.fonts.load(step["font_path"], check_existing=True)
    curve.align_x, curve.align_y = "CENTER", "CENTER"
    curve.resolution_u = 16
    curve.fill_mode = "BOTH"
    curve.extrude = 0.5
    obj = bpy.data.objects.new(step["name"], curve)
    bpy.context.scene.collection.objects.link(obj)
    activate(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    bpy.context.view_layer.update()
    width, height, depth = obj.dimensions
    if min(width, height, depth) <= 0:
        raise ValueError("字体没有输出有效的文字实体。")
    target = step["size_mm"]
    scale = min(target[0] / width, target[1] / height) / 1000
    for vertex in obj.data.vertices:
        vertex.co.x *= scale
        vertex.co.y *= scale
        vertex.co.z *= target[2] / depth / 1000
    obj.data.update()
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        before = sum(not edge.is_manifold for edge in bm.edges)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-8)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        after = sum(not edge.is_manifold for edge in bm.edges)
        print(f"YaHa lettering topology: nonmanifold {before} -> {after}", flush=True)
        if after:
            raise ValueError("字体轮廓未形成封闭的文字实体，无法可靠刻字。")
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    bpy.context.view_layer.update()
    return obj
