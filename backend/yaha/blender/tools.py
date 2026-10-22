"""几何工具注册表；输入已经由应用校验，场景单位为米。"""

import json
import math
from pathlib import Path
import bmesh
import bpy
from mathutils import Matrix, Vector
from loft import loft
from sweep import sweep
from cushion import cushion
from rounded_box import rounded_box
from lettering import lettering


def activate(obj):
    for item in bpy.context.selected_objects:
        item.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def segments(radius_mm):
    count = max(32, math.ceil(math.pi / math.acos(1 - min(0.005 / radius_mm, 1))))
    if count > 512:
        raise ValueError("曲线细分超过预算，请减小尺寸。")
    return math.ceil(count / 4) * 4


def mesh_object(vertices, faces, name, *, preserve_winding=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        if not preserve_winding:
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def profile(step):
    points = step["points"]
    n = len(points)
    vertices = [(x, y, z) for z in (0, 1) for x, y in points]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh_object(vertices, faces, step["name"])


def star(step):
    data = step | {"points": [(math.cos(i * math.pi / 5 + math.pi / 2) * (1 if i % 2 == 0 else 0.45), math.sin(i * math.pi / 5 + math.pi / 2) * (1 if i % 2 == 0 else 0.45)) for i in range(10)]}
    return profile(data)


def revolve(step):
    n = segments(max(step["size_mm"]) / 2)
    vertices, rings, faces = [], [], []
    for radius, height in step["points"]:
        if radius < 0:
            raise ValueError("旋转轮廓的半径不能为负数。")
        ring = []
        for i in range(1 if radius == 0 else n):
            ring.append(len(vertices))
            vertices.append((radius * math.cos(i * 2 * math.pi / n), radius * math.sin(i * 2 * math.pi / n), height))
        rings.append(ring)
    for a, b in zip(rings, rings[1:] + rings[:1]):
        for i in range(n):
            face = list(dict.fromkeys((a[i % len(a)], a[(i + 1) % len(a)], b[(i + 1) % len(b)], b[i % len(b)])))
            if len(face) >= 3:
                faces.append(face)
    return mesh_object(vertices, faces, step["name"])


def primitive(step):
    n = segments(max(step["size_mm"]) / 2)
    factory = {
        "box": lambda: bpy.ops.mesh.primitive_cube_add(size=1),
        "cylinder": lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=1, depth=1),
        "ellipsoid": lambda: bpy.ops.mesh.primitive_uv_sphere_add(segments=n, ring_count=max(16, n // 2), radius=1),
    }
    factory[step["shape"]]()
    return bpy.context.object


def usagi(step):
    bpy.ops.wm.stl_import(filepath=str(Path(__file__).parent / "assets/usagi.stl"))
    return bpy.context.object


def boolean(body, cutter, operation):
    modifier = body.modifiers.new("实体" + operation, "BOOLEAN")
    modifier.operation = operation
    modifier.solver = "MANIFOLD"
    modifier.object = cutter
    cutter.hide_render = True
    cutter.display_type = "WIRE"
    return body


def volume_mm3(obj):
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new()
    try:
        bm.from_mesh(evaluated.data)
        bm.transform(evaluated.matrix_world)
        return abs(bm.calc_volume(signed=True)) * 1e9
    finally:
        bm.free()


def cup(step):
    width, _, height = step["size_mm"]
    wall, bottom = step["wall_mm"], step["bottom_mm"]
    n = segments(width / 2)
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=width / 2000, depth=height / 1000)
    outer = bpy.context.object
    bpy.ops.mesh.primitive_cylinder_add(vertices=n, radius=(width / 2 - wall) / 1000, depth=(height - bottom + 2) / 1000, location=(0, 0, (bottom / 2 + 1) / 1000))
    inner = bpy.context.object
    inner.name = step["id"] + "_inner"
    return boolean(outer, inner, "DIFFERENCE")


FACTORIES = {**{name: primitive for name in ("box", "cylinder", "ellipsoid")}, "rounded_box": rounded_box, "text": lettering, "star": star, "polygon": profile, "revolve": revolve, "loft": loft, "sweep": sweep, "cushion": cushion, "usagi": usagi, "cup": cup}
OPERATIONS = {"add": "UNION", "subtract": "DIFFERENCE", "intersect": "INTERSECT"}


def part(step):
    obj = FACTORIES[step["shape"]](step)
    obj.name = step["id"] + " · " + step["name"]
    obj["yaha_part_id"] = step["id"]
    obj["yaha_parameters"] = json.dumps(step, ensure_ascii=False)
    if step["shape"] != "cup":
        bounds = [Vector(point) for point in obj.bound_box]
        center = (Vector(tuple(min(p[i] for p in bounds) for i in range(3))) + Vector(tuple(max(p[i] for p in bounds) for i in range(3)))) / 2
        for vertex in obj.data.vertices:
            if step.get("coordinate_origin", "bounds_center") == "bounds_center":
                vertex.co -= center
            if step["shape"] in ("revolve", "loft", "sweep", "rounded_box"):
                vertex.co /= 1000
        if step["shape"] in ("revolve", "loft", "sweep", "rounded_box", "text"):
            obj.data.update()
            bpy.context.view_layer.update()
            if step["shape"] not in ("sweep", "text") and any(abs(actual * 1000 - expected) > 0.01 for actual, expected in zip(obj.dimensions, step["size_mm"])):
                raise ValueError("轮廓或放样尺寸与 size_mm 不一致，禁止整体缩放。")
        else:
            obj.dimensions = [size / 1000 for size in step["size_mm"]]
        activate(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = [math.radians(angle) for angle in step["rotation_deg"]]
    obj.location = [position / 1000 for position in step["center_mm"]]
    if step["shape"] == "cup":
        # 内腔与外壳使用同一变换，独立保留壁厚和底厚。
        inner = obj.modifiers[0].object
        inner.parent = obj
        inner.matrix_parent_inverse.identity()
    if step["bevel_mm"]:
        modifier = obj.modifiers.new("圆角", "BEVEL")
        modifier.width = step["bevel_mm"] / 1000
        modifier.segments = segments(step["bevel_mm"]) // 4
    bpy.context.view_layer.update()
    return obj


def input_mesh(request):
    path = Path(request["input_mesh"])
    if path.suffix == ".glb":
        bpy.ops.import_scene.gltf(filepath=str(path))
        objects = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
        if not objects:
            raise ValueError("导入文件没有网格。")
        activate(objects[0])
        for obj in objects:
            obj.select_set(True)
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.scale *= request.get("input_scale", 1)
    else:
        data = json.loads(path.read_text(encoding="utf-8"))
        obj = mesh_object([[coordinate / 1000 for coordinate in vertex] for vertex in data["vertices"]], data["faces"], "导入模型", preserve_winding=True)
    if request.get("repair"):
        activate(obj)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bm = bmesh.new()
        try:
            bm.from_mesh(obj.data)
            boundary = [edge for edge in bm.edges if edge.is_boundary]
            if boundary:
                bmesh.ops.holes_fill(bm, edges=boundary, sides=32)
            from islands import repair_winding
            repair_winding(bm)
            bm.to_mesh(obj.data)
        finally:
            bm.free()
    return obj


def build_scene(request, progress, directory=None):
    bpy.context.scene["yaha_plan"] = json.dumps(request.get("source_plan", request.get("plan", {})), ensure_ascii=False)
    features, body, effects, boolean_effects = {}, None, [], []
    if request.get("plan", {}).get("generator"):
        from generators import build_generator
        body = build_generator(request["plan"]["generator"])
    if request.get("heightmap"):
        from heightmap import build_heightmap
        body = build_heightmap(request)
    if request.get("input_mesh"):
        body = input_mesh(request)
    if request.get("input_files", {}).get("reference.blend"):
        archive = bpy.data.collections.new("原参数部件 · 已隐藏")
        bpy.context.scene.collection.children.link(archive)
        archive.hide_render = archive.hide_viewport = True
        with bpy.data.libraries.load(request["input_files"]["reference.blend"], link=False) as (source, target):
            target.objects = source.objects
        for obj in target.objects:
            if obj and obj.type == "MESH":
                archive.objects.link(obj)
                if obj.parent is None:
                    obj.location -= Vector(request["reference_shift_m"])
    for index, step in enumerate(request.get("plan", {}).get("steps", [])):
        progress(15 + int(55 * (index + 1) / len(request["plan"]["steps"])), "制作部件：" + step["name"])
        if step["shape"] == "text":
            step = step | {"font_path": request["input_files"][step["font_file"]]}
        obj = part(step)
        if step.get('frame_m'):
            obj.matrix_world = Matrix(step['frame_m'])
            bpy.context.view_layer.update()
        # 复制独立部件保留层级元数据，供前端装配体视口拾取与高亮
        preview_mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        preview_obj = bpy.data.objects.new(step["id"] + " · " + step["name"], preview_mesh)
        preview_obj.matrix_world = obj.matrix_world.copy()
        preview_obj["yaha_part_id"] = step["id"]
        preview_obj["yaha_part_name"] = step["name"]
        preview_obj["yaha_part_shape"] = step["shape"]
        preview_obj["yaha_is_part_preview"] = True
        preview_obj["yaha_units"] = "m"
        bpy.context.scene.collection.objects.link(preview_obj)
        preview_obj.hide_render = True
        preview_obj.hide_viewport = True
        if step["shape"] == "cup":
            features[step["id"]] = {"frame_m": [list(row) for row in obj.matrix_world], "height_mm": step["size_mm"][2], "radius_mm": step["size_mm"][0] / 2}
        before = volume_mm3(body) if body is not None else None
        body = obj if body is None else boolean(body, obj, OPERATIONS[step["operation"]])
        if before is not None:
            after = volume_mm3(body)
            changed = after - before if step["operation"] == "add" else before - after
            if changed <= 1e-4:
                raise ValueError("工具未改变实际实体体积，请修正位置、朝向、切入深度与交叠关系：" + step["id"] + " · " + step["name"])
            boolean_effects.append({"id": step["id"], "operation": step["operation"], "volume_change_mm3": changed})
            if step["shape"] == "text":
                effects.append({"id": step["id"], "text": step["text"], "operation": step["operation"], "volume_change_mm3": changed})
    bpy.context.scene["yaha_lettering_effects"] = json.dumps(effects, ensure_ascii=False)
    bpy.context.scene["yaha_boolean_effects"] = json.dumps(boolean_effects)
    if body is None:
        raise ValueError("没有可执行的建模部件。")
    if request.get("plan", {}).get("surface"):
        from sculpt import sculpt
        progress(74, "融合曲面并整理自然轮廓")
        body = sculpt(body, request["plan"]["surface"], request["max_faces"], preserve_topology=request.get("preserve_topology", False))
    if request.get("capture_body"):
        from body_source import capture
        capture(body, directory)
    if request.get("finish"):
        from finishing import finish
        body = finish(body, request["finish"])
    bpy.context.view_layer.update()
    return body, features
