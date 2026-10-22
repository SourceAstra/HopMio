import trimesh
from ..contracts import DomainError


def split_shells(mesh):
    """对朝向一致的制造网格区分实体外壳与负向内腔边界。"""
    parts = mesh.split(only_watertight=False)
    return [part for part in parts if part.volume >= 0], [part for part in parts if part.volume < 0]


def load_mesh(path):
    try:
        value = trimesh.load(path, force="mesh")
        if not isinstance(value, trimesh.Trimesh) or not len(value.faces):
            raise ValueError("empty")
        if len(value.faces) > 1_000_000:
            raise DomainError("模型超过一百万个面，请先减面再导入。")
        # STL 的 float32 坐标可能把布尔边界的极小三角面合并成零面积面。
        value.update_faces(value.nondegenerate_faces())
        value.update_faces(value.unique_faces())
        value.remove_unreferenced_vertices()
        return value
    except DomainError:
        raise
    except Exception:
        raise DomainError("模型无法读取，请重新导出为 STL、GLB 或 3MF。")
