"""毫米单位的几何积木，供不同角色与作品模板复用。"""

import trimesh


def ellipsoid(center, radii, subdivisions=4):
    mesh = trimesh.creation.icosphere(subdivisions=subdivisions)
    mesh.apply_scale(radii)
    mesh.apply_translation(center)
    return mesh
