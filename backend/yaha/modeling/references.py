"""有限图像载荷覆盖全部参考视角，新增细节照片另保留大图。"""

import base64
import io
import math
from PIL import Image, ImageDraw, ImageOps
from ..contracts import DomainError


def encode(image):
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=92, subsampling=0)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode()


def load(assets, identifier, size):
    asset = assets.db.get("assets", identifier)
    if not asset or asset["kind"] != "image":
        raise DomainError("照片参考包含非图片材料，请重新选择。", "PHOTO_REQUIRED")
    with Image.open(assets.path(identifier)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail(size)
        return image


def reference_images(spec, assets):
    ids = spec.asset_ids
    if len(ids) <= 12:
        return [encode(load(assets, identifier, (2048, 2048))) for identifier in ids]
    # 全部视角进入有序总览，不静默截断；最新四张保留独立细节图。
    pages = []
    per_page = math.ceil(len(ids) / 8)
    columns = min(3, per_page)
    for offset in range(0, len(ids), per_page):
        batch = ids[offset:offset + per_page]
        sheet = Image.new("RGB", (columns * 640, math.ceil(len(batch) / columns) * 508), "#f3f1ec")
        draw = ImageDraw.Draw(sheet)
        for index, identifier in enumerate(batch):
            image = load(assets, identifier, (624, 472))
            x, y = index % columns * 640, index // columns * 508
            sheet.paste(image, (x + (640 - image.width) // 2, y + 28 + (472 - image.height) // 2))
            draw.text((x + 10, y + 6), str(offset + index + 1), fill="#262626")
        pages.append(encode(sheet))
    previous = set(spec.modeling_plan.source_asset_ids) if spec.modeling_plan else set()
    details = [identifier for identifier in ids if identifier not in previous][-4:] or ids[-4:]
    return pages + [encode(load(assets, identifier, (2048, 2048))) for identifier in details]
