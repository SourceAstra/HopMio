"""导出是真实文件；3MF 使用毫米，不携带虚构切片参数。"""

import io
import json
import zipfile
from xml.etree import ElementTree as ET
from .geometry.models import load_mesh
from .contracts import DomainError


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
    if format in ("stl", "glb"):
        identifier = project["model"][f"{format}_id"]
        return assets.db.get("assets", identifier)
    if format == "3mf":
        mesh = load_mesh(assets.path(project["model"]["stl_id"]))
        content = three_mf(mesh)
    elif format == "usagi":
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "project.json",
                json.dumps(
                    {
                        "schema_version": 1,
                        "name": project["name"],
                        "spec": project["spec"],
                        "story": project["story"],
                    },
                    ensure_ascii=False,
                ),
            )
            for format in ("stl", "glb"):
                archive.writestr(
                    "model." + format,
                    assets.path(project["model"][f"{format}_id"]).read_bytes(),
                )
            if project["model"].get("source_stl_id"):
                archive.writestr(
                    "source.stl",
                    assets.path(project["model"]["source_stl_id"]).read_bytes(),
                )
            for index, identifier in enumerate(project["spec"].get("asset_ids", [])):
                original = assets.path(identifier)
                archive.writestr(
                    f"inputs/{index}{original.suffix}", original.read_bytes()
                )
        content = out.getvalue()
        format = "usagi"
    else:
        raise DomainError("支持 STL、3MF、GLB 和 .usagi 作品包。")
    return assets.write(content, "." + format, project["name"] + "." + format, "export")
