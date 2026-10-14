"""使用观测相机与遮挡检查投影真实照片；不依赖类别资产或生成纹理。"""

import zipfile
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def paint(source, camera_data, archive, directory, minimum):
    photos = directory / "photo_textures"
    photos.mkdir()
    with zipfile.ZipFile(archive) as package:
        names = package.namelist()
        if len(names) > 96 or len(names) != len(set(names)) or any(Path(name).name != name or not name.endswith(".jpg") for name in names) or sum(item.file_size for item in package.infolist()) > 128 * 1024 * 1024:
            raise ValueError("观测贴图包超过数量、路径或大小预算。")
        package.extractall(photos)
    conversion = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))
    vertices = np.asarray([tuple(source.matrix_world @ vertex.co) for vertex in source.data.vertices])
    faces = np.asarray([tuple(face.vertices) for face in source.data.polygons])
    if faces.shape[1] != 3:
        raise ValueError("观测表面需要三角网格。")
    triangles = vertices[faces]
    centers = triangles.mean(axis=1)
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(lengths[:, None], 1e-12)
    tree = BVHTree.FromPolygons(vertices.tolist(), faces.tolist(), all_triangles=True)
    epsilon = max(float(np.ptp(vertices, axis=0).max()) * 1e-6, 1e-10)
    views, scores = camera_data["views"], []
    projections, origins = [], []
    for view in views:
        rotation, translation, intrinsic = np.asarray(view["rotation"]), np.asarray(view["translation"]), np.asarray(view["K"])
        world_to_camera = rotation @ np.asarray(conversion.inverted())
        projected = vertices @ world_to_camera.T + translation
        image_points = projected @ intrinsic.T
        uv = image_points[:, :2] / np.maximum(image_points[:, 2:3], 1e-12)
        origin = np.asarray(conversion) @ (-rotation.T @ translation)
        direction = origin - centers
        distance = np.linalg.norm(direction, axis=1)
        facing = np.sum(normals * direction, axis=1) / np.maximum(distance, 1e-12)
        valid_vertices = (projected[:, 2] > 0) & (uv[:, 0] >= 0) & (uv[:, 0] < view["width"] - 1) & (uv[:, 1] >= 0) & (uv[:, 1] < view["height"] - 1)
        valid = valid_vertices[faces].all(axis=1) & (facing > 0.1)
        scores.append(np.where(valid, facing / np.maximum(distance ** 2, 1e-12), -np.inf))
        projections.append(uv)
        origins.append(origin)
    scores = np.asarray(scores)
    candidates = np.argsort(scores, axis=0)[-min(4, len(views)):][::-1]
    chosen = np.full(len(faces), -1, dtype=int)
    for index in range(len(faces)):
        for view_id in candidates[:, index]:
            if not np.isfinite(scores[view_id, index]):
                break
            direction = origins[view_id] - centers[index]
            distance = np.linalg.norm(direction)
            direction /= distance
            hit = tree.ray_cast(Vector(centers[index] + normals[index] * epsilon), Vector(direction), distance - epsilon)
            if hit[0] is None:
                chosen[index] = view_id
                break
    covered = float(lengths[chosen >= 0].sum() / max(lengths.sum(), 1e-12))
    if covered < minimum:
        raise ValueError(f"照片贴图仅覆盖{covered:.1%}的观测表面，低于{minimum:.1%}要求；请补拍缺失角度。")
    layer = source.data.uv_layers.new(name="照片投影")
    source.data.materials.clear()
    for view in views:
        image = bpy.data.images.load(str(photos / view["name"]), check_existing=True)
        image.pack()
        material = bpy.data.materials.new("观测照片 " + view["name"])
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        nodes.clear()
        output, emission, texture, mapping = (nodes.new(name) for name in ("ShaderNodeOutputMaterial", "ShaderNodeEmission", "ShaderNodeTexImage", "ShaderNodeUVMap"))
        texture.image, mapping.uv_map = image, layer.name
        links.new(mapping.outputs["UV"], texture.inputs["Vector"])
        links.new(texture.outputs["Color"], emission.inputs["Color"])
        links.new(emission.outputs[0], output.inputs["Surface"])
        source.data.materials.append(material)
    neutral = bpy.data.materials.new("未观测区域")
    neutral.diffuse_color = (0.4, 0.4, 0.4, 1)
    source.data.materials.append(neutral)
    for index, face in enumerate(source.data.polygons):
        view_id = int(chosen[index])
        face.material_index = view_id if view_id >= 0 else len(views)
        if view_id >= 0:
            view = views[view_id]
            uv = (projections[view_id][faces[index]] + 0.5) / [view["width"], view["height"]]
            for loop, point in zip(face.loop_indices, uv):
                layer.data[loop].uv = (float(point[0]), float(1 - point[1]))
    source.data.update()
    return {"texture_method": "visible-photo-projection", "textured_surface_ratio": covered, "untextured_faces": int((chosen < 0).sum()), "texture_views": len(views)}
