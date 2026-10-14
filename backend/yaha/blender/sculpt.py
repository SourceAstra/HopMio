"""参考造型的传统曲面整理；保持比例并复测成品高度。"""

import math
import bpy


def sculpt(body, options, max_faces, preserve_topology=False):
    from tools import activate
    from finishing import bounds
    activate(body)
    # 先固化受控部件，源工程仍保留独立部件及其参数。
    for modifier in list(body.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    low, high = bounds(body)
    extent = high - low
    if extent.z <= 1e-8:
        raise ValueError("参考造型没有有效高度。")
    target = options["height_mm"] / 1000
    if preserve_topology:
        return normalize(body, target)
    scale = target / extent.z
    bpy.context.scene["yaha_sculpt_scale"] = scale
    voxel = options["voxel_mm"] / 1000 / scale
    if math.prod(extent) / voxel ** 3 > 200_000_000:
        raise ValueError("曲面精度超出内存预算，请在细节调整中增大体素尺寸。")
    modifier = body.modifiers.new("曲面融合", "REMESH")
    modifier.mode, modifier.voxel_size = "VOXEL", voxel
    modifier.use_smooth_shade = True
    modifier.use_remove_disconnected = False
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    if options["smooth_iterations"]:
        modifier = body.modifiers.new("轮廓柔化", "SMOOTH")
        modifier.factor, modifier.iterations = 0.5, options["smooth_iterations"]
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    body.data.calc_loop_triangles()
    if len(body.data.loop_triangles) > max_faces:
        modifier = body.modifiers.new("曲面面数预算", "DECIMATE")
        modifier.ratio = max_faces * 0.95 / len(body.data.loop_triangles)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    from islands import remove_flat_islands
    remove_flat_islands(body)
    body.data.update()
    bpy.context.view_layer.update()
    return normalize(body, target)


def normalize(body, target):
    from finishing import bounds
    low, high = bounds(body)
    scale = target / (high.z - low.z)
    bpy.context.scene["yaha_sculpt_scale"] = scale
    for vertex in body.data.vertices:
        vertex.co *= scale
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    body.data.update()
    bpy.context.view_layer.update()
    return body
