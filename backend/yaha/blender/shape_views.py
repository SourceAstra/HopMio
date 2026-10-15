"""参考造型的实际三视图，用于照片对照；不冒充标定相机投影。"""

import math
import json
from array import array
import bpy
from mathutils import Vector


def render_views(body, directory, progress):
    from finishing import bounds
    scene = bpy.context.scene
    low, high = bounds(body)
    center, span = (low + high) / 2, max(high - low)
    material = bpy.data.materials.new("审阅灰模")
    material.diffuse_color = (0.52, 0.54, 0.57, 1)
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.52, 0.54, 0.57, 1)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.65
    body.data.materials.clear()
    body.data.materials.append(material)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.8, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
    scene.render.engine = "CYCLES"
    scene.cycles.device, scene.cycles.samples = "CPU", 24
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    camera = bpy.data.objects.new("造型审阅相机", bpy.data.cameras.new("三视图相机"))
    scene.collection.objects.link(camera)
    camera.data.type, camera.data.ortho_scale = "ORTHO", span * 1.25
    camera.data.clip_start, camera.data.clip_end = 0.0001, 100
    scene.camera = camera
    for index, position in enumerate(((-2, -3, 4), (3, 1, 2))):
        light = bpy.data.objects.new("审阅灯" + str(index), bpy.data.lights.new("面光源", "AREA"))
        scene.collection.objects.link(light)
        light.location = center + Vector(position) * span
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        light.data.energy, light.data.size = 120 * span ** 2, span * 2
    views = (("front", 0), ("right", 90), ("back", 180), ("left", 270), ("front-right", 45), ("back-left", 225))
    scene["yaha_review_views"] = json.dumps([{"position": name, "yaw_deg": yaw} for name, yaw in views])
    width, height = 1536, 1024
    pixels = array('f', [1]) * (width * height * 4)
    for index, (_, yaw) in enumerate(views):
        progress(76 + index, "生成包含背面与左右侧面的实际造型六视图")
        angle = math.radians(yaw)
        camera.location = center + Vector((math.sin(angle) * 4, -math.cos(angle) * 4, 0.7)) * span
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(directory / ("view-" + str(index) + ".png"))
        bpy.ops.render.render(write_still=True)
        view = bpy.data.images.load(scene.render.filepath, check_existing=False)
        block = array('f', [0]) * (512 * 512 * 4)
        view.pixels.foreach_get(block)
        for row in range(512):
            offset = (((1 - index // 3) * 512 + row) * width + (index % 3) * 512) * 4
            pixels[offset:offset + 512 * 4] = block[row * 512 * 4:(row + 1) * 512 * 4]
        bpy.data.images.remove(view)
    sheet = bpy.data.images.new("造型三视图", width=width, height=height)
    sheet.pixels.foreach_set(pixels)
    sheet.filepath_raw, sheet.file_format = str(directory / "comparison.png"), "PNG"
    sheet.save()
    sheet.pack()
