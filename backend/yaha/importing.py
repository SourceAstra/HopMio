"""作品包仅包含数据与网格，解压内容不执行、不写任意路径。"""

import base64
import io
import json
import zipfile
from .contracts import DesignSpec, DomainError
from .geometry.models import load_mesh, save_model


def import_package(encoded, assets, projects):
    if len(encoded) > 18 * 1024 * 1024:
        raise DomainError("作品包超过 12 MB。")
    try:
        with zipfile.ZipFile(
            io.BytesIO(base64.b64decode(encoded, validate=True))
        ) as package:
            if sum(i.file_size for i in package.infolist()) > 60 * 1024 * 1024:
                raise DomainError("作品包解压后过大。")
            data = json.loads(package.read("project.json"))
            if data.get("schema_version") != 1:
                raise DomainError("这个作品包的版本暂时不支持。")
            spec = DesignSpec.model_validate(data["spec"])
            originals = []
            for name in sorted(
                n for n in package.namelist() if n.startswith("inputs/")
            )[:4]:
                extension = "." + name.rsplit(".", 1)[-1]
                if extension in (".png", ".stl", ".glb", ".3mf"):
                    asset = assets.write(
                        package.read(name),
                        extension,
                        "恢复的材料" + extension,
                        "image" if extension == ".png" else "model-input",
                    )
                    originals.append(asset["id"])
            spec.asset_ids = originals
            stl = assets.write(package.read("model.stl"), ".stl", "恢复的作品.stl")
            mesh = load_mesh(assets.path(stl["id"]))
            project = projects.create(
                str(data.get("name", "恢复的作品")) + " · 副本", spec.model_dump()
            )
            model = save_model(mesh, assets, "作品包恢复")
            if "source.stl" in package.namelist():
                model["source_stl_id"] = assets.write(
                    package.read("source.stl"), ".stl", "原始网格.stl"
                )["id"]
            project = projects.revision(
                project["id"], spec.model_dump(), model, "从作品包恢复"
            )
            return projects.update(
                project["id"], story=str(data.get("story", ""))[:4000]
            )
    except DomainError:
        raise
    except Exception:
        raise DomainError("作品包损坏或格式不正确，请选择小屋导出的 .usagi 文件。")
