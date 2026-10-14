"""将 OpenMVS 的本地贴图嵌入 GLB，输出不依赖任务暂存目录。"""

import hashlib
import json
import struct
from pathlib import Path

def pack_glb(file, limit=40 * 1024 * 1024):
    data = file.read_bytes()
    magic, version, size = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or size != len(data):
        raise ValueError("扫描 GLB 文件头无效。")
    chunks, offset = {}, 12
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        if offset + length > len(data) or kind in chunks:
            raise ValueError("扫描 GLB 数据块无效。")
        chunks[kind] = data[offset:offset + length]
        offset += length
    document = json.loads(chunks[0x4E4F534A])
    if len(document.get("buffers", [])) != 1:
        raise ValueError("扫描 GLB 需要单一数据缓冲区。")
    binary = bytearray(chunks.get(0x004E4942, b""))
    textures = []
    for image in document.get("images", []):
        uri = image.get("uri")
        if not uri or uri.startswith("data:"):
            continue
        relative = Path(uri)
        path = (file.parent / relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(file.parent.resolve()) or path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            raise ValueError("扫描 GLB 贴图引用超出暂存目录。")
        content = path.read_bytes()
        if len(binary) + len(content) > limit:
            raise ValueError("扫描网格与贴图超过40MB，请降低重建或贴图分辨率。")
        binary.extend(b"\0" * (-len(binary) % 4))
        views = document.setdefault("bufferViews", [])
        image["bufferView"] = len(views)
        image["mimeType"] = "image/png" if path.suffix.lower() == ".png" else "image/webp" if path.suffix.lower() == ".webp" else "image/jpeg"
        del image["uri"]
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(content)})
        binary.extend(content)
        textures.append({"name": path.name, "sha256": hashlib.sha256(content).hexdigest()})
    document["buffers"][0] = {"byteLength": len(binary)}
    encoded = json.dumps(document, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    payload = struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary
    result = struct.pack("<4sII", b"glTF", 2, len(payload) + 12) + payload
    if len(result) > limit:
        raise ValueError("封装后的扫描 GLB 超过40MB。")
    return result, textures
