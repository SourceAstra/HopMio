"""本地模板只描述参数与操作，实际几何由 Blender 生成。"""

from .contracts import GeometryPlan
from ..geometry.usagi import usagi
from ..contracts import DomainError


def template_plan(spec):
    parameters = {
        "width_mm": {"value": spec.width_mm, "label": "宽度", "unit": "mm"},
        "depth_mm": {"value": spec.depth_mm, "label": "深度", "unit": "mm"},
        "height_mm": {"value": spec.height_mm, "label": "高度", "unit": "mm"},
        "wall_mm": {"value": spec.thickness_mm, "label": "壁厚", "unit": "mm"},
        "bottom_mm": {"value": spec.bottom_mm, "label": "底厚", "unit": "mm"},
    }
    size = [{"parameter": name} for name in ("width_mm", "depth_mm", "height_mm")]
    factories = {
        "usagi": lambda: usagi(size),
        "bunny": lambda: usagi(size),
        "cup": lambda: {"id": "cup", "name": "圆笔筒", "shape": "cup", "size_mm": [size[0], size[0], size[2]], "wall_mm": {"parameter": "wall_mm"}, "bottom_mm": {"parameter": "bottom_mm"}},
        "plaque": lambda: {"id": "plaque", "name": "小屋名牌", "shape": "box", "size_mm": [size[0], {"parameter": "wall_mm"}, size[2]]},
    }
    if spec.template not in factories:
        raise DomainError("这个模板尚未注册。", "PLAN_TEMPLATE")
    step = factories[spec.template]()
    step["coordinate_origin"] = "bounds_center"
    expected = [spec.width_mm, spec.width_mm if spec.template == "cup" else spec.thickness_mm if spec.template == "plaque" else spec.depth_mm, spec.height_mm]
    constraints = [] if spec.base else [{"feature": "model." + axis, "expected_mm": length} for axis, length in zip(("width", "depth", "height"), expected)]
    if spec.template == "cup":
        constraints += [{"feature": "cup.wall", "expected_mm": {"parameter": "wall_mm"}}, {"feature": "cup.bottom", "expected_mm": {"parameter": "bottom_mm"}}]
    return GeometryPlan.model_validate({"title": step["name"], "parameters": parameters, "steps": [step], "constraints": constraints})
