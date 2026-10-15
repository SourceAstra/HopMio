"""欢迎作品复制已确认的乌萨奇素材，不在启动时运行建模。"""

from pathlib import Path
import trimesh
from .contracts import DesignSpec
from .geometry.models import load_mesh


def ensure_starter(service):
    if service.projects.list():
        return
    spec = DesignSpec(width_mm=48, depth_mm=36, height_mm=80, prompt="乌萨奇摆件：细长耳朵、大头短身、开心的 ω 嘴和脸颊刻线。")
    source = Path(__file__).parent / "blender/assets"
    mesh = load_mesh(source / "usagi.stl")
    preview = mesh.copy()
    preview.apply_scale(0.001)
    preview.apply_transform(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    scene = trimesh.Scene(preview, metadata={"yaha_units": "m"})
    contents = {"stl": (source / "usagi.stl").read_bytes(), "glb": scene.export(file_type="glb")}
    saved = []
    project = None
    try:
        ids = {}
        for extension, content in contents.items():
            asset = service.assets.write(content, "." + extension, "欢迎乌萨奇." + extension, units="mm" if extension == "stl" else "m")
            saved.append(asset["id"])
            ids[extension + "_id"] = asset["id"]
        model = ids | {"size_mm": mesh.extents.round(2).tolist(), "faces": len(mesh.faces), "volume_mm3": round(abs(mesh.volume), 2), "origin": "乌萨奇主题 · 内置示例", "preview_units": "m", "precision_status": "unverified"}
        project = service.projects.create("乌萨奇的第一份礼物", spec.model_dump())
        service.projects.revision(project["id"], spec.model_dump(), model, "内置欢迎作品，后续生成由 Blender 完成")
    except Exception:
        if project:
            service.projects.delete(project["id"])
        for identifier in reversed(saved):
            service.assets.remove(identifier)
        raise
