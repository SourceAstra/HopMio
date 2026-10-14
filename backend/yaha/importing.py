"""作品包只恢复数据与资产，不打开或执行 Blender 工程。"""

import base64
import hashlib
import io
import json
import re
import zipfile
from .contracts import DesignSpec, DomainError
from .geometry.models import load_mesh
from .package_contract import MAX_PACKAGE_BYTES, MAX_UNPACKED_BYTES, MODEL_FILES, remap_observations
from .reconstruction.contracts import ReconstructionQuality


def import_package(encoded, assets, projects):
    if len(encoded) > (MAX_PACKAGE_BYTES + 2) // 3 * 4:
        raise DomainError("作品包超过 256 MB。")
    saved, project = [], None
    try:
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(encoded, validate=True))) as package:
            names = package.namelist()
            allowed = {"project.json", "model.stl", "model.glb", "print.gcode.3mf", "slice-report.json"} | set(MODEL_FILES)
            if len(names) != len(set(names)) or len(names) > 109 or any(name not in allowed and not re.fullmatch(r"inputs/(?:[0-9]|[1-8][0-9]|9[0-5])\.(png|jpg|jpeg|webp|stl|glb|3mf)", name) for name in names):
                raise DomainError("作品包包含不支持的文件。")
            if sum(item.file_size for item in package.infolist()) > MAX_UNPACKED_BYTES or any(item.file_size > 40 * 1024 * 1024 for item in package.infolist()):
                raise DomainError("作品包解压后过大。")
            data = json.loads(package.read("project.json"))
            version = data.get("schema_version")
            if version not in (1, 2, 3):
                raise DomainError("这个作品包的版本暂时不支持。")
            if version in (2, 3):
                files = data["files"]
                if set(files) != set(names) - {"project.json"}:
                    raise DomainError("作品包文件清单不一致。")
                for name, expected in files.items():
                    content = package.read(name)
                    if len(content) != expected["bytes"] or hashlib.sha256(content).hexdigest() != expected["sha256"]:
                        raise DomainError("作品包文件校验失败。")
            spec = DesignSpec.model_validate(data["spec"])

            def store(name, extension, kind="model", units=None):
                asset = assets.write(package.read(name), extension, name, kind, units=units)
                saved.append(asset["id"])
                return asset["id"]

            originals = []
            inputs = sorted((name for name in names if name.startswith("inputs/")), key=lambda name: int(name.split("/")[1].split(".")[0]))
            if any(int(name.split("/")[1].split(".")[0]) != index for index, name in enumerate(inputs)):
                raise DomainError("作品包的输入序号不连续。")
            for name in inputs:
                extension = "." + name.rsplit(".", 1)[-1]
                originals.append(store(name, extension, "image" if extension in (".png", ".jpg", ".jpeg", ".webp") else "model-input"))
            if version == 3 and len(originals) != len(spec.asset_ids):
                raise DomainError("作品包的来源照片与设计契约数量不一致。")
            mapping = dict(zip(spec.asset_ids, originals))
            restored = remap_observations(spec.model_dump(), mapping)
            restored["asset_ids"] = originals
            spec = DesignSpec.model_validate(restored)
            stl = store("model.stl", ".stl", units="mm")
            mesh = load_mesh(assets.path(stl))
            preview_units = data.get("model", {}).get("preview_units", "mm")
            if preview_units not in ("mm", "m"):
                raise DomainError("作品包预览单位无效。")
            model = {"stl_id": stl, "glb_id": store("model.glb", ".glb", units=preview_units), "preview_units": preview_units,
                     "size_mm": mesh.extents.round(3).tolist(), "faces": len(mesh.faces), "volume_mm3": round(abs(mesh.volume), 3),
                     "origin": "作品包恢复", "precision_status": "unverified", "measurements": []}
            for name, (key, units) in MODEL_FILES.items():
                if name in names:
                    model[key] = store(name, "." + name.rsplit(".", 1)[-1], units=units)
            if data.get("model", {}).get("reconstruction"):
                model["reconstruction"] = ReconstructionQuality.model_validate(remap_observations(data["model"]["reconstruction"], mapping)).model_dump() | {"imported_history": True}
            for name in ("print.gcode.3mf", "slice-report.json"):
                if name in names:
                    store(name, "." + name.rsplit(".", 1)[-1], "imported-history")
            # 外部包的历史复测结果可供溯源，不能替代当前复测。
            project = projects.create(str(data.get("name", "恢复的作品")) + " · 副本", spec.model_dump())
            project = projects.revision(project["id"], spec.model_dump(), model, "恢复作品包，源工程未执行")
            return projects.update(project["id"], story=str(data.get("story", ""))[:4000])
    except Exception as error:
        if project:
            with projects.db.transaction() as connection:
                connection.execute("DELETE FROM revisions WHERE project_id=?", (project["id"],))
                connection.execute("DELETE FROM projects WHERE id=?", (project["id"],))
        for identifier in reversed(saved):
            assets.remove(identifier)
        if isinstance(error, DomainError):
            raise
        raise DomainError("作品包损坏或格式不正确，请选择小屋导出的 .usagi 文件。") from None
