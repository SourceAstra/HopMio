"""通用扫描表面：保留原件，另建制造副本；不使用人体或类别模板。"""

import json
import hashlib
import math
import shutil
import bpy
from mathutils import Euler, Matrix, Vector
from tools import activate, boolean
from finishing import bounds
from islands import remove_noise, weld_surface
from photo_texture import paint

GLTF_TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
CAMERA_TO_UPRIGHT = GLTF_TO_BLENDER.inverted()


def reference_scale(source, camera_data, ratio):
    reference = camera_data.get("scale_reference")
    if not reference:
        return None
    rotation = Matrix(camera_data["rotation"])
    origin = GLTF_TO_BLENDER @ -(rotation.transposed() @ Vector(camera_data["translation"]))
    inverse = source.matrix_world.inverted()
    intrinsic = Matrix(camera_data["K"]).inverted()
    hits = []
    for x, y in reference["points_px"]:
        direction = (GLTF_TO_BLENDER @ rotation.transposed() @ intrinsic @ Vector((x, y, 1))).normalized()
        hit, location, _, _ = source.ray_cast(inverse @ origin, (inverse.to_3x3() @ direction).normalized())
        if not hit:
            raise ValueError("标尺端点未落在已重建表面，请选择物体上的可见端点。")
        hits.append(source.matrix_world @ location)
    distance = (hits[1] - hits[0]).length
    if distance < 1e-8:
        raise ValueError("标尺端点的三维距离退化。")
    return reference["distance_mm"] / 1000 / distance * ratio


def render_reference(camera_data, directory):
    scene = bpy.context.scene
    camera = bpy.data.objects.new("照片比对相机", bpy.data.cameras.new("相机标定"))
    scene.collection.objects.link(camera)
    rotation = Matrix(camera_data["rotation"])
    pose = (GLTF_TO_BLENDER @ rotation.transposed()).to_4x4()
    pose.translation = GLTF_TO_BLENDER @ -(rotation.transposed() @ Vector(camera_data["translation"]))
    camera.matrix_world = pose @ Matrix.Diagonal((1, -1, -1, 1))
    width, height, k = camera_data["width"], camera_data["height"], camera_data["K"]
    ratio = k[0][0] / k[1][1]
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.clip_start, camera.data.clip_end = 0.00001, 1000000
    camera.data.lens = k[0][0] * camera.data.sensor_width / width
    camera.data.shift_x = (width / 2 - k[0][2]) / width
    camera.data.shift_y = (k[1][2] - height / 2) * ratio / width
    camera["yaha_reference_resolution"] = [width, height]
    camera["yaha_reference_pixel_aspect"] = ratio
    scene["yaha_reference_camera"] = camera.name
    render_camera(camera, directory)
    return camera


def render_camera(camera, directory):
    scene = bpy.context.scene
    width, height = camera["yaha_reference_resolution"]
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x, scene.render.pixel_aspect_y = 1, camera["yaha_reference_pixel_aspect"]
    scene.render.engine = "CYCLES"
    scene.cycles.device, scene.cycles.samples = "CPU", 16
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = str(directory / "comparison.png")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    bpy.ops.render.render(write_still=True)


def evaluated_copy(source, name):
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(source.evaluated_get(graph), depsgraph=graph)
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    result.matrix_world = source.matrix_world.copy()
    return result


def build_surface(request, progress, directory):
    paths, parameters = request["input_files"], request["surface_parameters"]
    bpy.ops.import_scene.gltf(filepath=paths["source.glb"])
    objects = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    if not objects:
        raise ValueError("扫描网格没有可编辑的表面。")
    for obj in objects:
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
    activate(objects[0])
    for obj in objects:
        obj.select_set(True)
    bpy.ops.object.join()
    source = bpy.context.object
    source.name = "原始扫描表面"
    camera_data = json.loads(open(paths["camera.json"], encoding="utf-8").read())
    physical_scale = reference_scale(source, camera_data, parameters["scale_ratio"])
    texture_report = paint(source, camera_data, paths["photos.zip"], directory, request["min_textured_surface_ratio"])
    progress(80, "按真实相机生成照片比对")
    camera = render_reference(camera_data, directory)
    review = directory.parent.parent / "model-diagnostics" / request["job_id"]
    review.mkdir(parents=True, exist_ok=True)
    for name in ("source.glb", "camera.json", "reference.png"):
        shutil.copyfile(paths[name], review / name)
    shutil.copyfile(directory / "comparison.png", review / "comparison.png")
    entries = sorted((p for p in review.parent.iterdir() if p.is_dir() and not p.is_symlink() and len(p.name) == 36), key=lambda p: p.stat().st_mtime, reverse=True)
    for entry in entries[3:]:
        shutil.rmtree(entry)
    rotation = Matrix(camera_data["rotation"])
    frame = (CAMERA_TO_UPRIGHT @ rotation @ GLTF_TO_BLENDER.inverted()).to_4x4()
    frame.translation = CAMERA_TO_UPRIGHT @ Vector(camera_data["translation"])
    edit_rotation = Euler([math.radians(parameters["rotate_" + axis]) for axis in "xyz"], "XYZ").to_matrix().to_4x4()
    source.matrix_world = edit_rotation @ frame @ source.matrix_world
    camera.matrix_world = edit_rotation @ frame @ camera.matrix_world
    bpy.context.view_layer.update()
    low, high = bounds(source)
    height = high.z - low.z
    if height <= 1e-8:
        raise ValueError("扫描表面高度退化。")
    overlap = min(parameters["voxel"] * 2, parameters["base_h"] / 2)
    lift = (parameters["base_h"] - overlap) / 1000
    target_height = parameters["height"] / 1000 - lift
    progress(83, "保留扫描原件并制作闭合副本")
    body = evaluated_copy(source, "制造修补副本")
    # 体素闭合会重建拓扑并丢失投影 UV；制造副本使用中性几何，真实贴图保留在扫描原件。
    body.data.materials.clear()
    activate(body)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cleanup = weld_surface(body, max(height * 1e-7, 1e-10))
    bpy.context.view_layer.update()
    print("YaHa surface preparation: " + json.dumps(cleanup), flush=True)
    modifier = body.modifiers.new("制造体素闭合", "REMESH")
    modifier.mode = "VOXEL"
    modifier.voxel_size = parameters["voxel"] / 1000 / (physical_scale or target_height / height)
    modifier.use_smooth_shade = True
    modifier.use_remove_disconnected = False
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    cleanup.update(remove_noise(body, request["max_removed_volume_ratio"]))
    body.data.calc_loop_triangles()
    if len(body.data.loop_triangles) > request["max_faces"]:
        modifier = body.modifiers.new("制造面数预算", "DECIMATE")
        modifier.ratio = request["max_faces"] * 0.98 / len(body.data.loop_triangles)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    low, high = bounds(body)
    scale = physical_scale or target_height / (high.z - low.z)
    normalize = Matrix.Scale(scale, 4)
    normalize.translation = Vector((-(low.x + high.x) / 2 * scale, -(low.y + high.y) / 2 * scale, -low.z * scale + lift))
    for obj in (source, body, camera):
        obj.matrix_world = normalize @ obj.matrix_world
    bpy.context.view_layer.update()
    base = None
    if parameters["base_h"]:
        low, high = bounds(body)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, parameters["base_h"] / 2000))
        base = bpy.context.object
        base.name = "独立底座"
        base.dimensions = (high.x - low.x + parameters["base_margin"] / 500, high.y - low.y + parameters["base_margin"] / 500, parameters["base_h"] / 1000)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        modifier = base.modifiers.new("底座圆角", "BEVEL")
        modifier.width, modifier.segments = min(0.001, parameters["base_h"] / 4000), 6
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        boolean(body, base, "UNION")
    source["yaha_units"], source["yaha_appearance"] = "m", "original"
    body["yaha_units"] = "m"
    scene = bpy.context.scene
    scene["yaha_plan"] = json.dumps(request["surface_plan"], ensure_ascii=False)
    scene["yaha_surface"] = json.dumps({"source": source.name, "base": base.name if base else None, "scale_to_m": scale, "scale_ratio": parameters["scale_ratio"], "source_faces": len(source.data.polygons), "voxel_mm": parameters["voxel"], "input_sha256": request["quality"]["source_sha256"]} | cleanup | texture_report, ensure_ascii=False)
    reference = bpy.data.images.load(paths["reference.png"], check_existing=True)
    reference.name = "校正后的参考照片"
    reference.pack()
    return body, {}


def export_surface(files, directory):
    data = json.loads(bpy.context.scene["yaha_surface"])
    source = bpy.data.objects[data["source"]]
    for obj in bpy.context.scene.objects:
        obj.select_set(False)
    source.hide_set(False)
    source.hide_render = False
    source.select_set(True)
    bpy.context.view_layer.objects.active = source
    original = directory / "source.glb"
    manufacturing = directory / "manufacturing.glb"
    shutil.copyfile(files["glb"], manufacturing)
    bpy.ops.export_scene.gltf(filepath=str(original), export_format="GLB", use_selection=True, export_yup=True, export_extras=True)
    if data["base"]:
        base = bpy.data.objects[data["base"]]
        base.hide_set(False)
        base.hide_render = False
        base.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(files["glb"]), export_format="GLB", use_selection=True, export_yup=True, export_extras=True)
    source.hide_set(True)
    source.hide_render = True
    if data["base"]:
        base.hide_set(True)
        base.hide_render = True
    scene = bpy.context.scene
    manufacturing_mesh = bpy.data.objects["制造模型"]
    for obj in scene.objects:
        if obj.type == "MESH":
            obj.hide_render = obj != manufacturing_mesh
    render_camera(bpy.data.objects[scene["yaha_reference_camera"]], directory)
    data.update(comparison_basis="manufacturing_mesh", manufacturing_appearance="neutral_geometry", comparison_stl_sha256=hashlib.sha256(files["stl"].read_bytes()).hexdigest())
    scene["yaha_surface"] = json.dumps(data, ensure_ascii=False)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(files["blend"]), check_existing=False, compress=True)
    return files | {"source_glb": original, "manufacturing_glb": manufacturing, "comparison": directory / "comparison.png", "reference": directory / "reference.png"}, data
