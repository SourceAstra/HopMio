"""受控资产标识与原子文件写入，禁止任意路径访问。"""

import base64
import hashlib
import mimetypes
import os
import uuid
from pathlib import Path
from ..contracts import DomainError
from ..package_contract import MAX_PACKAGE_BYTES

MAX_ASSET_BYTES = 40 * 1024 * 1024


class Assets:
    def __init__(self, db):
        self.db = db
        self.root = db.root / "assets"
        self.root.mkdir(exist_ok=True)

    def write(self, content: bytes, extension: str, name: str, kind: str = "model", *, units=None):
        if kind == "model" and extension in {".png", ".jpg", ".jpeg", ".webp"}:
            kind = "image"
        limit = MAX_PACKAGE_BYTES if extension == ".usagi" else MAX_ASSET_BYTES
        if len(content) > limit:
            raise DomainError(f"文件超过 {limit // 1024 // 1024} MB，请先减少图片尺寸或模型面数。")
        if extension not in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".glb",
            ".stl",
            ".3mf",
            ".usagi",
            ".blend",
            ".json",
        }:
            raise DomainError("这个文件类型还不能放进小屋。")
        identifier = str(uuid.uuid4())
        file = self.root / (identifier + extension)
        temp = file.with_suffix(extension + ".partial")
        try:
            with temp.open("wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            temp.replace(file)
            asset = {
                "id": identifier,
                "extension": extension,
                "name": Path(name).name,
                "kind": kind,
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
                "mime": {
                    ".glb": "model/gltf-binary",
                    ".stl": "application/octet-stream",
                    ".3mf": "model/3mf",
                }.get(
                    extension, mimetypes.guess_type(file)[0] or "application/octet-stream"
                ),
            }
            if units is not None:
                asset["units"] = units
            self.db.put("assets", identifier, asset)
        except Exception:
            temp.unlink(missing_ok=True)
            file.unlink(missing_ok=True)
            raise
        return asset

    def remove(self, identifier: str):
        try:
            file = self.path(identifier)
            file.unlink(missing_ok=True)
        except Exception:
            pass
        self.db.delete("assets", identifier)

    def path(self, identifier: str):
        try:
            uuid.UUID(identifier)
        except (ValueError, TypeError):
            raise DomainError("找不到这个作品文件。")
        asset = self.db.get("assets", identifier)
        if not asset:
            raise DomainError("找不到这个作品文件。")
        file = self.root / (identifier + asset["extension"])
        if not file.is_file():
            raise DomainError("作品文件不在原来的位置，可以尝试从备份恢复。")
        return file

    def upload(self, name: str, encoded: str):
        if len(encoded) > 18 * 1024 * 1024:
            raise DomainError("上传文件超过 12 MB，请先压缩。")
        try:
            content = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise DomainError("文件内容不完整，请重新上传。")
        if len(content) > 12 * 1024 * 1024:
            raise DomainError("上传文件超过 12 MB，请先压缩。")
        extension = Path(name).suffix.lower()
        if extension in {".png", ".jpg", ".jpeg", ".webp"}:
            from PIL import Image, ImageOps
            import io

            try:
                image = Image.open(io.BytesIO(content))
                if image.width * image.height > 20_000_000:
                    raise DomainError("图片太大，请缩小到 2000 万像素以内。")
                image.load()
                image = ImageOps.exif_transpose(image)
                image.thumbnail((4096, 4096))
                output = io.BytesIO()
                if "A" in image.getbands() and image.getchannel("A").getextrema()[0] < 255:
                    image.convert("RGBA").save(output, format="PNG")
                    extension = ".png"
                else:
                    image.convert("RGB").save(output, format="JPEG", quality=95, subsampling=0)
                    extension = ".jpg"
                return self.write(output.getvalue(), extension, name, "image")
            except DomainError:
                raise
            except Exception:
                raise DomainError("这张图片打不开，请换一张 PNG 或 JPG。")
        if extension not in {".stl", ".glb", ".3mf"}:
            raise DomainError("支持 PNG、JPG、WebP 图片，以及 STL、GLB、3MF 模型。")
        return self.write(content, extension, name, "model-input")

    def data_uri(self, identifier):
        asset = self.db.get("assets", identifier)
        if not asset or (asset.get("kind") != "image" and asset.get("extension") not in {".png", ".jpg", ".jpeg", ".webp"}):
            raise DomainError("请先选择一张照片或自己的画。")
        return (
            f"data:{asset['mime']};base64,"
            + base64.b64encode(self.path(identifier).read_bytes()).decode()
        )
