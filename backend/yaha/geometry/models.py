import io
import trimesh
from ..contracts import DomainError, Mode
from .templates import TEMPLATES, fit_and_finish
from .images import silhouette, relief


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


def generate_local(spec, assets, finish=True):
    if spec.mode == Mode.TEXT:
        factory = TEMPLATES.get(spec.template)
        if not factory:
            raise DomainError("这个本地模板还没有注册。")
        mesh = factory(spec)
    elif spec.mode in (Mode.SILHOUETTE, Mode.RELIEF, Mode.IMPORT):
        if not spec.asset_ids:
            raise DomainError("请先到取材角选一张图片或模型。")
        path = assets.path(spec.asset_ids[0])
        mesh = {Mode.SILHOUETTE: silhouette, Mode.RELIEF: relief}.get(
            spec.mode, lambda p, s: load_mesh(p)
        )(path, spec)
        if spec.mode == Mode.IMPORT and path.suffix == ".glb":
            mesh.apply_transform(
                trimesh.transformations.rotation_matrix(
                    3.141592653589793 / 2, (1, 0, 0)
                )
            )
        if spec.mode in (Mode.SILHOUETTE, Mode.RELIEF):
            spec.depth_mm = spec.thickness_mm
    else:
        raise DomainError("单图和多视角重建需要家长配置 Meshy 服务。", "AI_REQUIRED")
    return fit_and_finish(mesh, spec) if finish else mesh


def save_model(mesh, assets, origin):
    # 以实际 STL 精度清理一次，使预览和打印用的是同一份网格。
    mesh = trimesh.load(
        io.BytesIO(mesh.export(file_type="stl")), file_type="stl", force="mesh"
    )
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.update_faces(mesh.unique_faces())
    mesh.remove_unreferenced_vertices()
    stl = assets.write(mesh.export(file_type="stl"), ".stl", "作品.stl")
    display = mesh.copy()
    display.visual.face_colors = [255, 209, 65, 255]
    # 打印模型是 Z 向上；GLB 的显示坐标是 Y 向上。
    display.apply_transform(
        trimesh.transformations.rotation_matrix(-3.141592653589793 / 2, (1, 0, 0))
    )
    glb = assets.write(display.export(file_type="glb"), ".glb", "作品.glb")
    return {
        "stl_id": stl["id"],
        "glb_id": glb["id"],
        "size_mm": mesh.extents.round(2).tolist(),
        "faces": len(mesh.faces),
        "volume_mm3": round(abs(mesh.volume), 2),
        "origin": origin,
    }
