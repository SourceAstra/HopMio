"""单一已求值网格输出；STL 用毫米，GLB 和 Blender 场景用米。"""

import struct
import json
import bmesh
import bpy
from mathutils import Vector


def export_scene(obj, directory, max_faces, features, clean_flat=False, voxel_mm=0, preview_views=False, progress=None):
    from finishing import bounds
    low, high = bounds(obj)
    shift = Vector((-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
    bpy.context.scene["yaha_export_shift_m"] = list(shift)
    for item in bpy.context.scene.objects:
        if item.parent is None:
            item.location += shift
    for feature in features.values():
        for axis in range(3):
            feature["frame_m"][axis][3] += shift[axis]
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=bpy.context.evaluated_depsgraph_get())
    result = bpy.data.objects.new("制造模型", mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = obj.matrix_world.copy()
    result["yaha_units"] = "m"
    result["yaha_plan"] = bpy.context.scene["yaha_plan"]
    # 制造文件的 float32 毫米精度先进入同一快照，再消除布尔产生的极小退化边。
    for vertex in mesh.vertices:
        world = result.matrix_world @ vertex.co
        vertex.co = Vector(struct.unpack("<3f", struct.pack("<3f", *(world * 1000)))) / 1000
    result.matrix_world.identity()
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-8)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-8)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    if clean_flat:
        from islands import remove_flat_islands, remove_micro_islands
        remove_flat_islands(result)
        cleanup = remove_micro_islands(result, voxel_mm ** 3 / 8)
        bpy.context.scene["yaha_micro_cleanup"] = json.dumps(cleanup)
    mesh.calc_loop_triangles()
    if not mesh.loop_triangles or len(mesh.loop_triangles) > max_faces:
        raise ValueError("模型为空或超过面数预算。")
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        topology = {"triangles": len(mesh.loop_triangles), "boundary_edges": sum(edge.is_boundary for edge in bm.edges), "nonmanifold_edges": sum(not edge.is_manifold for edge in bm.edges)}
    finally:
        bm.free()
    vertices = [result.matrix_world @ vertex.co for vertex in mesh.vertices]
    bounds = [min(v[i] for v in vertices) for i in range(3)], [max(v[i] for v in vertices) for i in range(3)]
    size = [(bounds[1][i] - bounds[0][i]) * 1000 for i in range(3)]
    paths = {name: directory / ("model." + name) for name in ("stl", "glb", "blend")}
    with paths["stl"].open("wb") as file:
        file.write(b"YaHa Craft / millimeters".ljust(80, b"\0"))
        file.write(struct.pack("<I", len(mesh.loop_triangles)))
        for triangle in mesh.loop_triangles:
            a, b, c = (vertices[i] * 1000 for i in triangle.vertices)
            normal = (b - a).cross(c - a).normalized()
            file.write(struct.pack("<12fH", *normal, *a, *b, *c, 0))
    part_items = [item for item in bpy.context.scene.objects if item.get("yaha_is_part_preview")]
    scale = bpy.context.scene.get("yaha_sculpt_scale")
    if scale:
        for p in part_items:
            p.scale *= scale
            p.location *= scale
    if part_items:
        for item in bpy.context.scene.objects:
            item.select_set(False)
            item.hide_render = item not in part_items
            item.hide_set(item not in part_items)
        for p in part_items:
            p.hide_viewport = False
            p.hide_render = False
            p.hide_set(False)
            p.select_set(True)
        bpy.context.view_layer.objects.active = part_items[0]
        bpy.ops.export_scene.gltf(filepath=str(paths["glb"]), export_format="GLB", use_selection=True, export_yup=True, export_extras=True)
        manufacturing = directory / "manufacturing.glb"
        for item in bpy.context.scene.objects:
            item.select_set(False)
            item.hide_render = item != result
            item.hide_set(item != result)
        result.hide_set(False)
        result.select_set(True)
        bpy.context.view_layer.objects.active = result
        bpy.ops.export_scene.gltf(filepath=str(manufacturing), export_format="GLB", use_selection=True, export_yup=True, export_extras=True)
        paths["manufacturing_glb"] = manufacturing
    else:
        for item in bpy.context.scene.objects:
            item.select_set(False)
            item.hide_render = item != result
            item.hide_set(item != result)
        result.hide_set(False)
        result.select_set(True)
        bpy.context.view_layer.objects.active = result
        bpy.ops.export_scene.gltf(filepath=str(paths["glb"]), export_format="GLB", use_selection=True, export_yup=True, export_extras=True)
    if preview_views:
        from shape_views import render_views
        try:
            # 审阅视图与 STL 使用同一最终网格，包含制造清理后的结果。
            render_views(result, directory, progress)
        except Exception as error:
            (directory / "comparison.png").unlink(missing_ok=True)
            bpy.context.scene["yaha_review_error"] = str(error)[:500]
    for p in part_items:
        p.hide_viewport = True
        p.hide_set(True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(paths["blend"]), check_existing=False, compress=True)
    return paths, size, topology
