import hashlib
import re
import zipfile
from xml.etree import ElementTree as ET
from ..contracts import DomainError


def inspect_output(path):
    if not path.is_file():
        raise DomainError("切片器没有生成打印3MF，原模型保留。", "SLICE_OUTPUT")
    with zipfile.ZipFile(path) as package:
        names = [name for name in package.namelist() if re.fullmatch(r"Metadata/plate_\d+\.gcode", name)]
        if len(names) != 1 or package.getinfo(names[0]).file_size > 200 * 1024 * 1024:
            raise DomainError("打印3MF缺少唯一有效的切片板。", "SLICE_OUTPUT")
        data = package.read(names[0])
        info = package.read("Metadata/slice_info.config") if "Metadata/slice_info.config" in package.namelist() else b""
        if len(info) > 256 * 1024:
            raise DomainError("切片摘要超过读取预算。", "SLICE_OUTPUT")
    text = data.decode("utf-8", errors="replace")
    layers = len(re.findall(r"^;\s*(?:CHANGE_LAYER|LAYER_CHANGE)", text, re.MULTILINE))
    if not layers:
        matches = re.findall(r"^;\s*(?:total layer number|total layers count)\s*[:=]\s*(\d+)", text, re.MULTILINE | re.IGNORECASE)
        layers = int(matches[0]) if matches else 0
    extrusion = len(re.findall(r"^G[01]\s[^;\n]*\bE[-+0-9.]", text, re.MULTILINE))
    if not layers or extrusion < 10:
        raise DomainError("切片结果没有足够的层或挤出路径，不能交付为可打印模型。", "SLICE_EMPTY")
    def value(pattern):
        match = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
        return match.group(1).strip() if match else None
    root = ET.fromstring(info) if info else ET.Element("config")
    metadata = {item.get("key"): item.get("value") for item in root.findall("plate/metadata")}
    if metadata.get("outside") != "false" or not metadata.get("printer_model_id") or value(r"^;\s*printer_model\s*=\s*(.+)$") != "Bambu Lab A1 mini":
        raise DomainError("切片器未确认 A1 mini 机型或打印板范围，不能交付打印文件。", "SLICE_MACHINE")
    return {"printer_model_id": metadata["printer_model_id"], "material": root.find("plate/filament").get("type") if root.find("plate/filament") is not None else None, "layers": layers, "extrusion_moves": extrusion, "gcode_sha256": hashlib.sha256(data).hexdigest(), "estimated_time": value(r"total estimated time:\s*([^\n;]+)") or value(r"^;\s*estimated printing time[^=]*=\s*(.+)$"), "estimated_seconds": int(metadata["prediction"]) if metadata.get("prediction", "").isdigit() else None, "filament_grams": value(r"^;\s*total filament weight\s*\[g\]\s*[:=]\s*(.+)$"), "filament_mm": value(r"^;\s*total filament length\s*\[mm\]\s*[:=]\s*(.+)$"), "nozzle_mm": value(r"^;\s*nozzle_diameter\s*=\s*(.+)$"), "outside_plate": False, "support_used": metadata.get("support_used") == "true", "warnings": [dict(item.attrib) for item in root.findall("plate/warning")], "print_file_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
