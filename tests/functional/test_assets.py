"""TC-A 系列：素材上传、受控写入、路径解析与删除归档。"""

import base64
import io

import pytest
from PIL import Image

from yaha.contracts import DomainError


def png_bytes(color="white", mode="RGBA", size=(32, 32), alpha=None):
    image = Image.new(mode, size, color)
    if alpha is not None and "A" in image.getbands():
        image.putalpha(alpha)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def upload(service, name, content):
    return service.assets.upload(name, base64.b64encode(content).decode())


class TestUpload:
    def test_tc_a_001_transparent_png_stays_png_image(self, service):
        """TC-A-001 含真实透明像素的 PNG 保持 PNG 且类型为图片，data_uri 可用。

        注：完全不透明的 RGBA 图会被有意转成 JPG 以省体积（见 TC-A-002）。
        """
        asset = upload(service, "画.png", png_bytes(alpha=128))
        assert asset["extension"] == ".png"
        assert asset["kind"] == "image"
        assert asset["bytes"] > 0 and len(asset["sha256"]) == 64
        uri = service.assets.data_uri(asset["id"])
        assert uri.startswith("data:image/png;base64,")

    def test_tc_a_001b_opaque_rgba_converted_to_jpg(self, service):
        """TC-A-001b 完全不透明的 RGBA PNG 被有意转为 JPEG 存储。"""
        asset = upload(service, "不透明.png", png_bytes())  # 默认 alpha=255
        assert asset["extension"] == ".jpg"

    def test_tc_a_002_opaque_image_converted_to_jpg(self, service):
        """TC-A-002 不透明图片统一转成 JPEG 存储。"""
        asset = upload(service, "照片.webp", png_bytes(mode="RGB"))
        assert asset["extension"] == ".jpg"
        assert asset["mime"] == "image/jpeg"

    def test_tc_a_003_unsupported_upload_type(self, service):
        """TC-A-003 上传 txt 等不支持的类型被拒绝。"""
        with pytest.raises(DomainError, match="支持 PNG、JPG、WebP 图片"):
            upload(service, "说明.txt", b"hello")

    def test_tc_a_004_invalid_base64(self, service):
        """TC-A-004 base64 内容损坏时给出明确提示。"""
        with pytest.raises(DomainError, match="文件内容不完整"):
            service.assets.upload("a.png", "!!!not-base64!!!")

    def test_tc_a_005_upload_size_limit(self, service):
        """TC-A-005 解码后超过 12MB 的上传被拒绝。"""
        big = b"0" * (12 * 1024 * 1024 + 1)
        with pytest.raises(DomainError, match="上传文件超过 12 MB"):
            upload(service, "大.png", big)

    def test_tc_a_006_model_upload_paths(self, service):
        """TC-A-006 STL/GLB/3MF 作为模型输入上传，kind=model-input。"""
        stl = upload(service, "部件.stl", b"solid x\nendsolid x\n")
        assert stl["kind"] == "model-input" and stl["extension"] == ".stl"
        glb = upload(service, "部件.glb", b"glTF-not-really")
        assert glb["kind"] == "model-input"
        with pytest.raises(DomainError):
            upload(service, "部件.obj", b"nope")

    def test_tc_a_007_upload_name_keeps_basename_only(self, service):
        """TC-A-007 上传文件名剥离路径，只保留文件名本身。"""
        asset = upload(service, "../..//etc/危险.png", png_bytes())
        assert asset["name"] == "危险.png"


class TestWrite:
    def test_tc_a_008_write_rejects_unknown_extension(self, service):
        """TC-A-008 受控写入只接受白名单扩展名。"""
        with pytest.raises(DomainError, match="这个文件类型还不能放进小屋"):
            service.assets.write(b"x", ".exe", "病毒.exe", "model")

    def test_tc_a_009_write_rejects_oversized_content(self, service):
        """TC-A-009 单个资产超过 40MB 上限被拒绝，且不残留临时文件。"""
        payload = b"0" * (40 * 1024 * 1024 + 1)
        with pytest.raises(DomainError, match="文件超过"):
            service.assets.write(payload, ".stl", "大.stl", "model")
        leftovers = list((service.db.root / "assets").glob("*.partial"))
        assert leftovers == []

    def test_tc_a_010_write_kind_normalization(self, service):
        """TC-A-010 图片扩展名即使声明为 model 也归一化为 image 类型。"""
        asset = service.assets.write(png_bytes(), ".png", "预览.png", "model")
        assert asset["kind"] == "image"

    def test_tc_a_011_sha256_matches_content(self, service):
        """TC-A-011 资产记录 sha256 与字节数，可校验完整性。"""
        import hashlib
        content = png_bytes()
        asset = service.assets.write(content, ".png", "完整性.png", "image")
        assert asset["sha256"] == hashlib.sha256(content).hexdigest()
        assert asset["bytes"] == len(content)


class TestPathAndRemove:
    def test_tc_a_012_path_requires_uuid(self, service):
        """TC-A-012 非法资产标识直接拒绝，不触碰文件系统。"""
        with pytest.raises(DomainError, match="找不到这个作品文件"):
            service.assets.path("../../secret.stl")

    def test_tc_a_013_path_missing_record(self, service):
        """TC-A-013 不存在的资产标识报错。"""
        import uuid
        with pytest.raises(DomainError, match="找不到这个作品文件"):
            service.assets.path(str(uuid.uuid4()))

    def test_tc_a_014_path_missing_file_on_disk(self, service):
        """TC-A-014 记录存在但文件丢失时给出恢复提示。"""
        import os
        asset = upload(service, "丢失.png", png_bytes())
        os.unlink(service.assets.path(asset["id"]))
        with pytest.raises(DomainError, match="作品文件不在原来的位置"):
            service.assets.path(asset["id"])

    def test_tc_a_015_remove_deletes_record_and_file(self, service):
        """TC-A-015 删除资产同时清理磁盘文件与记录。"""
        import os
        asset = upload(service, "删我.png", png_bytes())
        path = service.assets.path(asset["id"])
        service.assets.remove(asset["id"])
        assert not path.exists()
        assert service.db.get("assets", asset["id"]) is None


class TestAssetListing:
    def test_tc_a_016_list_marks_user_and_generated_source(self, service):
        """TC-A-016 素材列表区分用户上传与系统生成。"""
        uploaded = upload(service, "我的.png", png_bytes())
        listing = service.call("asset.list", {})
        by_id = {asset["id"]: asset for asset in listing}
        assert by_id[uploaded["id"]]["source"] == "user"
        starter_stl = [a for a in listing if a.get("kind") == "model"]
        assert starter_stl and all(a["source"] == "generated" for a in starter_stl)

    def test_tc_a_017_asset_delete_archives_instead_of_removing(self, service):
        """TC-A-017 asset.delete 归档素材（保留记录），文件与记录仍在。"""
        asset = upload(service, "归档.png", png_bytes())
        result = service.call("asset.delete", {"id": asset["id"]})
        assert result == {"ok": True, "id": asset["id"], "archived": True}
        assert service.db.get("assets", asset["id"])["archived"] is True
        assert any(a["id"] == asset["id"] for a in service.call("asset.list", {}))

    def test_tc_a_018_asset_delete_missing(self, service):
        """TC-A-018 删除不存在的素材提示刷新。"""
        import uuid
        with pytest.raises(DomainError, match="素材已不存在"):
            service.call("asset.delete", {"id": str(uuid.uuid4())})
