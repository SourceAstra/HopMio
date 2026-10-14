"""欢迎作品复制已确认的乌萨奇素材，不在启动时运行建模。"""

from pathlib import Path
from .contracts import DesignSpec
from .geometry.models import load_mesh


def ensure_starter(service):
    if service.projects.list():
        return
    spec = DesignSpec(width_mm=48, depth_mm=36, height_mm=80, prompt="乌萨奇摆件：细长耳朵、大头短身、开心的 ω 嘴和脸颊刻线。")
    source = Path(__file__).parent / "blender/assets"
    ids = {extension + "_id": service.assets.write((source / ("usagi." + extension)).read_bytes(), "." + extension, "欢迎乌萨奇." + extension, units="mm")["id"] for extension in ("stl", "glb")}
    mesh = load_mesh(source / "usagi.stl")
    model = ids | {"size_mm": mesh.extents.round(2).tolist(), "faces": len(mesh.faces), "volume_mm3": round(abs(mesh.volume), 2), "origin": "乌萨奇主题 · 内置示例", "preview_units": "mm", "precision_status": "unverified"}
    project = service.projects.create("乌萨奇的第一份礼物", spec.model_dump())
    service.projects.revision(project["id"], spec.model_dump(), model, "内置欢迎作品，后续生成由 Blender 完成")
