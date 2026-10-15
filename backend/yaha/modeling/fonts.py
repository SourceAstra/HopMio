"""字体是受控输入资产：检查字形覆盖，提取集合字体并参与构建摘要。"""

import io
import os
from pathlib import Path
from .runtime import ROOT
from ..contracts import DomainError


def lettering_inputs(compiled):
    steps = [step for step in compiled["steps"] if step["shape"] == "text"]
    if not steps:
        return {}
    try:
        from fontTools.ttLib import TTFont, TTLibError
    except ImportError:
        raise DomainError("文字建模需要 fonttools，请更新 backend/requirements-lock.txt 中的依赖。", "FONT_UNAVAILABLE") from None
    requested = os.environ.get("YAHA_TEXT_FONT", "auto")
    system = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    candidates = [Path(requested).expanduser()] if requested != "auto" else [
        ROOT / "backend/yaha/blender/assets/text-font.ttf",
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        system / "msyh.ttc",
        system / "simhei.ttf",
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
    ]
    characters = {ord(char) for step in steps for char in step["text"] if not char.isspace()}
    for path in candidates:
        if not path.is_file() or path.stat().st_size > 64 * 1024 * 1024:
            continue
        try:
            with TTFont(path, fontNumber=0) as font:
                cmap = font.getBestCmap() or {}
                if any(cmap.get(char, ".notdef") == ".notdef" for char in characters):
                    continue
                output = io.BytesIO()
                font.save(output)
                filename = "text-font.otf" if font.sfntVersion == "OTTO" else "text-font.ttf"
                for step in steps:
                    step["font_file"] = filename
                return {filename: output.getvalue()}
        except (OSError, TTLibError):
            continue
    raise DomainError("未找到覆盖全部刻字的字体。请安装思源黑体，或将 YAHA_TEXT_FONT 指向支持这些文字的 TTF/OTF/TTC 字体；原模型已保留。", "FONT_UNAVAILABLE")
