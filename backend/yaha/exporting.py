"""导出是真实文件；3MF 使用毫米，不携带虚构切片参数。"""

import io
import hashlib
import json
import zipfile
from xml.etree import ElementTree as ET
from .geometry.models import load_mesh
from .contracts import DomainError
from .package_contract import MODEL_FILES


def three_mf(mesh):
    ns = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
    ET.register_namespace("", ns)
    tag = lambda name: f"{{{ns}}}{name}"
    model = ET.Element(tag("model"), {"unit": "millimeter", "xml:lang": "zh-CN"})
    resources = ET.SubElement(model, tag("resources"))
    obj = ET.SubElement(resources, tag("object"), {"id": "1", "type": "model"})
    item = ET.SubElement(obj, tag("mesh"))
    verts = ET.SubElement(item, tag("vertices"))
    faces = ET.SubElement(item, tag("triangles"))
    for x, y, z in mesh.vertices:
        ET.SubElement(verts, tag("vertex"), dict(x=str(x), y=str(y), z=str(z)))
    for a, b, c in mesh.faces:
        ET.SubElement(faces, tag("triangle"), dict(v1=str(a), v2=str(b), v3=str(c)))
    ET.SubElement(ET.SubElement(model, tag("build")), tag("item"), {"objectid": "1"})
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
        )
        archive.writestr(
            "3D/3dmodel.model",
            ET.tostring(model, encoding="utf-8", xml_declaration=True),
        )
    return output.getvalue()


def export_project(project, assets, format):
    if not project["model"]:
        raise DomainError("先造出一个模型，再打包带走吧。")
    if format == "print3mf":
        report = project.get("slicing")
        if not report or report["revision_id"] != project["revision_id"]:
            raise DomainError("当前模型尚未完成实际切片。")
        return assets.db.get("assets", report["asset_id"])
    if format in ("stl", "glb", "blend", "source_glb", "manufacturing_glb"):
        identifier = (project["model"].get("manufacturing_glb_id") if format == "glb" else None) or project["model"].get(f"{format}_id")
        if not identifier:
            raise DomainError("这个旧版本没有 Blender 源工程，请生成新版本。")
        return assets.db.get("assets", identifier)
    if format == "3mf":
        mesh = load_mesh(assets.path(project["model"]["stl_id"]))
        content = three_mf(mesh)
    elif format == "usagi":
        out = io.BytesIO()
        files = {"model." + extension: assets.path((project["model"].get("manufacturing_glb_id") if extension == "glb" else None) or project["model"][extension + "_id"]).read_bytes() for extension in ("stl", "glb")}
        for name, (key, _) in MODEL_FILES.items():
            if project["model"].get(key):
                files[name] = assets.path(project["model"][key]).read_bytes()
        for index, identifier in enumerate(project["spec"].get("asset_ids", [])):
            original = assets.path(identifier)
            files[f"inputs/{index}{original.suffix}"] = original.read_bytes()
        source_mesh = (project["spec"].get("modeling_plan") or {}).get("source_mesh")
        if source_mesh:
            files["edit-source.stl"] = assets.path(source_mesh["asset_id"]).read_bytes()
        report = project.get("slicing")
        if report and report["revision_id"] == project["revision_id"]:
            files["print.gcode.3mf"] = assets.path(report["asset_id"]).read_bytes()
            files["slice-report.json"] = assets.path(report["report_id"]).read_bytes()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "project.json",
                json.dumps(
                    {
                        "schema_version": 5 if project["model"].get("script_document_id") else 4,
                        "name": project["name"],
                        "spec": project["spec"],
                        "story": project["story"],
                        "model": project["model"],
                        "slicing": report,
                        "files": {name: {"sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)} for name, content in files.items()},
                    },
                    ensure_ascii=False,
                ),
            )
            for name, content in files.items():
                archive.writestr(name, content)
        content = out.getvalue()
        format = "usagi"
    else:
        raise DomainError("支持 STL、3MF、GLB、Blender 源工程和 .usagi 作品包。")
    return assets.write(content, "." + format, project["name"] + "." + format, "export")
