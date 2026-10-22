"""制造副本的有界孤岛清理；原始扫描不修改，重要分离部件拒绝丢弃。"""

import bmesh
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def repair_winding(mesh):
    """只重排朝向不一致的连通壳，保留有效内腔的负向边界。"""
    mesh.normal_update()
    remaining = {face for edge in mesh.edges if edge.is_manifold and not edge.is_contiguous for face in edge.link_faces}
    while remaining:
        first = remaining.pop()
        faces, pending = {first}, [first]
        while pending:
            for edge in pending.pop().edges:
                for face in edge.link_faces:
                    if face not in faces:
                        faces.add(face)
                        pending.append(face)
        remaining.difference_update(faces)
        volume = math.fsum(face.calc_center_median().dot(face.normal) * face.calc_area() / 3 for face in faces)
        bmesh.ops.recalc_face_normals(mesh, faces=list(faces))
        if volume < 0:
            bmesh.ops.reverse_faces(mesh, faces=list(faces))
    if mesh.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))


def encloses(vertices, point):
    """封闭外壳的射线奇偶检查；用于将内腔边界归属到其实体。"""
    points = list(vertices)
    indices = {vertex: index for index, vertex in enumerate(points)}
    faces = {face for vertex in points for face in vertex.link_faces}
    tree = BVHTree.FromPolygons([vertex.co for vertex in points], [[indices[v] for v in face.verts] for face in faces])
    direction = Vector((1, 0.37139, 0.52973)).normalized()
    origin, count = point.copy(), 0
    epsilon = max(max(vertex.co.length for vertex in points) * 1e-6, 1e-10)
    for _ in range(len(faces) + 1):
        location, _, _, _ = tree.ray_cast(origin, direction)
        if location is None:
            return count % 2 == 1
        count += 1
        origin = location + direction * epsilon
    raise ValueError("内腔归属射线未收敛，拒绝清理。")


def remove_flat_islands(obj):
    """只删除独立、反向重合的三角面对；它们严格不承载体积。"""
    mesh = bmesh.new()
    try:
        mesh.from_mesh(obj.data)
        mesh.verts.index_update()
        pairs = {}
        for face in mesh.faces:
            if len(face.verts) == 3:
                key = tuple(sorted(vertex.index for vertex in face.verts))
                pairs.setdefault(key, []).append(face)
        removed = set()
        for faces in pairs.values():
            if len(faces) == 2 and all(set(vertex.link_faces) == set(faces) for vertex in faces[0].verts):
                removed.update(faces[0].verts)
        if removed:
            bmesh.ops.delete(mesh, geom=list(removed), context="VERTS")
            mesh.to_mesh(obj.data)
            obj.data.update()
        return len(removed)
    finally:
        mesh.free()


def remove_micro_islands(obj, limit_mm3):
    """清除布尔交界产生的亚体素孤屑，不删除达到建模分辨率的部件。"""
    mesh = bmesh.new()
    try:
        mesh.from_mesh(obj.data)
        remaining, removed, volumes = set(mesh.verts), [], []
        while remaining:
            first = remaining.pop()
            vertices, pending = {first}, [first]
            while pending:
                for edge in pending.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in remaining:
                            remaining.remove(vertex)
                            vertices.add(vertex)
                            pending.append(vertex)
            faces = {face for vertex in vertices for face in vertex.link_faces}
            if not faces or any(not edge.is_manifold for vertex in vertices for edge in vertex.link_edges):
                continue
            origin = first.co.copy()
            volume = abs(math.fsum((face.verts[0].co - origin).dot((face.verts[1].co - origin).cross(face.verts[2].co - origin)) / 6 for face in faces)) * 1e9
            if volume <= limit_mm3:
                removed.extend(vertices)
                volumes.append(volume)
        if removed:
            bmesh.ops.delete(mesh, geom=removed, context="VERTS")
            mesh.to_mesh(obj.data)
            obj.data.update()
        return {"removed_components": len(volumes), "removed_volume_mm3": math.fsum(volumes), "max_component_volume_mm3": limit_mm3}
    finally:
        mesh.free()


def weld_surface(obj, distance):
    mesh = bmesh.new()
    try:
        mesh.from_mesh(obj.data)
        before = len(mesh.verts)
        bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=distance)
        boundary = [edge for edge in mesh.edges if edge.is_boundary]
        filled = bmesh.ops.holes_fill(mesh, edges=boundary, sides=64)
        repair_winding(mesh)
        remaining = sum(edge.is_boundary for edge in mesh.edges)
        if remaining:
            raise ValueError(f"制造表面仍有{remaining}条开放边，超出小孔修补能力；请补拍或编辑源表面。")
        mesh.to_mesh(obj.data)
        obj.data.update()
        return {"welded_vertices": before - len(mesh.verts), "source_boundary_edges": len(boundary), "filled_faces": len(filled.get("faces", []))}
    finally:
        mesh.free()


def remove_noise(obj, max_removed_ratio):
    mesh = bmesh.new()
    try:
        mesh.from_mesh(obj.data)
        bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
        remaining, groups = set(mesh.verts), []
        while remaining:
            first = remaining.pop()
            vertices, pending = {first}, [first]
            while pending:
                for edge in pending.pop().link_edges:
                    for vertex in edge.verts:
                        if vertex in remaining:
                            remaining.remove(vertex)
                            vertices.add(vertex)
                            pending.append(vertex)
            faces = {face for vertex in vertices for face in vertex.link_faces}
            origin = first.co.copy()
            volume = math.fsum((face.verts[0].co - origin).dot((face.verts[1].co - origin).cross(face.verts[2].co - origin)) / 6 for face in faces)
            groups.append((vertices, volume))
        cavities = [group for group in groups if group[1] < 0]
        groups = [group for group in groups if group[1] > 0]
        owners = []
        for vertices, volume in cavities:
            candidates = [index for index, group in enumerate(groups) if group[1] > -volume and encloses(group[0], next(iter(vertices)).co)]
            if not candidates:
                raise ValueError("内腔边界没有可确认的外壳，拒绝改变实体拓扑。")
            owners.append((min(candidates, key=lambda index: groups[index][1]), vertices, volume))
        for index, vertices, volume in owners:
            outer, total = groups[index]
            groups[index] = (outer | vertices, total + volume)
        if not groups:
            raise ValueError("制造副本没有可用实体。")
        largest = max(groups, key=lambda group: group[1])
        total = sum(group[1] for group in groups)
        ratio = 1 - largest[1] / total if total > 0 else 1
        if ratio > max_removed_ratio:
            raise ValueError(f"扫描包含{len(groups)}个分离部件，主体外体积占{ratio:.2%}，超过{max_removed_ratio:.2%}的噪声清理上限；请调整主体范围或补拍连接部位。")
        removed = [vertex for vertices, _ in groups if vertices is not largest[0] for vertex in vertices]
        bmesh.ops.delete(mesh, geom=removed, context="VERTS")
        mesh.to_mesh(obj.data)
        return {"removed_components": len(groups) - 1, "removed_volume_ratio": ratio, "max_removed_volume_ratio": max_removed_ratio, "preserved_cavity_shells": sum(1 for index, _, _ in owners if groups[index][0] is largest[0])}
    finally:
        mesh.free()
