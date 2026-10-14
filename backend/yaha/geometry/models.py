import trimesh
from ..contracts import DomainError


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
