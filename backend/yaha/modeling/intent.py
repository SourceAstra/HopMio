"""明确要求必须落入可执行几何，不能由 assumptions 冒充执行。"""

import re
from ..contracts import DomainError


def validate_intent(spec, plan, compiled, adjustment=None):
    literal = re.compile(r'(?:刻字|刻有|刻上|刻|文字|名字|姓名|名称|内容|engrave|text)[^“”"\'。\n]{0,24}[“"\']([^”"\']{1,80})[”"\']', re.I)
    original_request = "" if plan.source_mesh else spec.prompt
    inscriptions = literal.findall(adjustment or "") or literal.findall(original_request)
    actual = [step.text for step in plan.steps if step.shape == "text"]
    if any(text not in actual for text in inscriptions):
        raise DomainError("明确指定的文字必须使用 text 工具真实建模，禁止只在 assumptions 中承诺刻字或用方块猜笔画。", "AI_PLAN_INVALID")
    request = adjustment if adjustment and re.search(r"心形.{0,4}孔|椭圆.{0,4}孔|方孔|heart.{0,4}hole|oval.{0,4}hole", adjustment, re.I) else original_request + " " + (adjustment or "")
    if re.search(r"(?:圆孔|圆形.{0,6}孔|孔.{0,6}圆形|round hole)", request, re.I):
        holes = [step for step in compiled["steps"] if step["operation"] == "subtract" and re.search(r"孔|hole", step["name"] + " " + step["id"], re.I)]
        if not holes or any(step["shape"] != "cylinder" or abs(step["size_mm"][0] - step["size_mm"][1]) > 1e-6 for step in holes):
            raise DomainError("圆孔须使用圆柱减法工具：旋转前 size_mm=[直径,直径,贯穿长度]，再旋转轴向；不能先按世界轴写尺寸后再次旋转。", "AI_PLAN_INVALID")
    if plan.schema_version < 5 and any(step.shape in ("text", "rounded_box") for step in plan.steps):
        raise DomainError("文字与精确圆角矩形需要 schema_version=5。", "AI_PLAN_INVALID")
