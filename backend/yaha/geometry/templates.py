"""孩子可以从这里注册自己的作品模板；所有尺寸单位是毫米。"""

import numpy as np
import trimesh
from ..contracts import DomainError


from .usagi import usagi


def pencil_cup(spec):
    outer = trimesh.creation.cylinder(radius=25, height=60, sections=96)
    outer.apply_translation((0, 0, 30))
    inner = trimesh.creation.cylinder(
        radius=25 - spec.thickness_mm, height=60, sections=96
    )
    inner.apply_translation((0, 0, 30 + spec.thickness_mm))
    return trimesh.boolean.difference([outer, inner], engine="manifold")


def plaque(spec):
    return trimesh.creation.box((spec.width_mm, spec.thickness_mm, spec.height_mm))


TEMPLATES = {"usagi": usagi, "bunny": usagi, "cup": pencil_cup, "plaque": plaque}


def fit_and_finish(mesh, spec, preserve_depth=False):
    """统一尺寸、落地、可选底座与挂孔，保证导出的实际尺寸一致。"""
    mesh.apply_translation(-mesh.bounds[0])
    mesh.apply_scale(
        np.array([spec.width_mm, spec.depth_mm, spec.height_mm]) / mesh.extents
    )
    mesh.apply_translation((-spec.width_mm / 2, -spec.depth_mm / 2, 0))
    if spec.base:
        base = trimesh.creation.cylinder(
            radius=max(spec.width_mm, spec.depth_mm) * 0.54,
            height=spec.thickness_mm,
            sections=96,
        )
        base.apply_translation((0, 0, spec.thickness_mm / 2))
        mesh = trimesh.boolean.union([mesh, base], engine="manifold")
    if spec.hole:
        radius = max(1.6, spec.thickness_mm * 0.6)
        hole = trimesh.creation.cylinder(
            radius=radius, height=spec.depth_mm * 3, sections=48
        )
        hole.apply_transform(
            trimesh.transformations.rotation_matrix(np.pi / 2, (1, 0, 0))
        )
        hole.apply_translation((0, 0, spec.height_mm * 0.82))
        if spec.hole_shape == "heart":
            # 两个圆洞与三角轮廓组成的心形孔。
            from shapely.geometry import Polygon
            from shapely.ops import unary_union
            from shapely.geometry import Point

            shape = unary_union(
                [
                    Point(-radius * 0.5, 0).buffer(radius * 0.65),
                    Point(radius * 0.5, 0).buffer(radius * 0.65),
                    Polygon([(-radius, 0), (radius, 0), (0, -radius * 1.3)]),
                ]
            )
            hole = trimesh.creation.extrude_polygon(
                shape, spec.depth_mm * 3, engine="manifold"
            )
            hole.apply_transform(
                trimesh.transformations.rotation_matrix(np.pi / 2, (1, 0, 0))
            )
            hole.apply_translation((0, spec.depth_mm * 1.5, spec.height_mm * 0.82))
        previous = 0.82
        for position in (0.82, 0.7, 0.6):
            hole.apply_translation((0, 0, (position - previous) * spec.height_mm))
            previous = position
            candidate = trimesh.boolean.difference([mesh, hole], engine="manifold")
            if candidate.volume < mesh.volume - 0.01:
                mesh = candidate
                break
        else:
            raise DomainError(
                "没有找到能穿过实体的挂孔位置。请先关闭挂孔，调整形状后再试。"
            )
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    return mesh
