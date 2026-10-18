"""仅求值白名单表达式，不执行模型代码。"""

import math
import operator
import numpy as np
from scipy.spatial.transform import Rotation
from shapely.geometry import LineString, Polygon
from .contracts import Expression, Reference
from ..contracts import DomainError

OPERATORS = {"add": operator.add, "subtract": operator.sub, "multiply": operator.mul, "divide": operator.truediv}


def compiled_geometry(compiled):
    return ([{key: value for key, value in step.items() if key != "name"} for step in compiled["steps"]], compiled["surface"], compiled.get("source_mesh"))


def value(item, parameters, depth=0):
    if depth > 8:
        raise DomainError("参数表达式过深。", "PLAN_BUDGET")
    if isinstance(item, Reference):
        if item.parameter not in parameters:
            raise DomainError("方案引用了不存在的参数。", "PLAN_REFERENCE")
        result = parameters[item.parameter].value
    elif isinstance(item, Expression):
        a, b = (value(arg, parameters, depth + 1) for arg in item.args)
        if item.op == "divide" and abs(b) < 1e-9:
            raise DomainError("参数表达式不能除以零。", "PLAN_EXPRESSION")
        result = OPERATORS[item.op](a, b)
    else:
        result = float(item)
    if not math.isfinite(result) or abs(result) > 2000:
        raise DomainError("参数超出有效范围。", "PLAN_RANGE")
    return result


def unit(item, parameters, depth=0):
    if depth > 8:
        raise DomainError("参数表达式过深。", "PLAN_BUDGET")
    if isinstance(item, Reference):
        if item.parameter not in parameters:
            raise DomainError("方案引用了不存在的参数。", "PLAN_REFERENCE")
        return parameters[item.parameter].unit
    if not isinstance(item, Expression):
        return None
    a, b = (unit(arg, parameters, depth + 1) for arg in item.args)
    if item.op in ("add", "subtract"):
        valid, result = a == b or a is None or b is None, a or b
    elif item.op == "multiply":
        valid = a in (None, "ratio") or b in (None, "ratio")
        result = b if a in (None, "ratio") else a
    else:
        valid = b in (None, "ratio") or a == b
        result = "ratio" if a == b and a is not None else a
    if not valid:
        raise DomainError("参数表达式的单位不一致。", "PLAN_UNIT")
    return result


def resolve(item, parameters, expected="mm"):
    actual = unit(item, parameters)
    if actual not in (None, expected):
        raise DomainError("参数单位与尺寸或角度不一致。", "PLAN_UNIT")
    return value(item, parameters)


def compile_plan(plan):
    steps = []
    for step in plan.steps:
        data = step.model_dump()
        data["center_mm"] = [resolve(item, plan.parameters) for item in step.center_mm]
        data["size_mm"] = [resolve(item, plan.parameters) for item in step.size_mm] if step.size_mm else None
        data["rotation_deg"] = [resolve(item, plan.parameters, "deg") for item in step.rotation_deg]
        data["points"] = [[resolve(item, plan.parameters, "ratio" if step.shape == "cushion" else "mm") for item in point] for point in step.points]
        for field in ("wall_mm", "bottom_mm", "bevel_mm", "corner_radius_mm"):
            data[field] = resolve(getattr(step, field), plan.parameters)
        data["sections"] = [{"z_mm": resolve(section.z_mm, plan.parameters), "width_mm": resolve(section.width_mm, plan.parameters), "depth_mm": resolve(section.depth_mm, plan.parameters), "offset_mm": [resolve(item, plan.parameters) for item in section.offset_mm], "exponent": section.exponent} for section in step.sections]
        data["path"] = [{"position_mm": [resolve(item, plan.parameters) for item in section.position_mm], "width_mm": resolve(section.width_mm, plan.parameters), "depth_mm": resolve(section.depth_mm, plan.parameters), "twist_deg": resolve(section.twist_deg, plan.parameters, "deg")} for section in step.path]
        if step.shape == "sweep":
            path = data["path"]
            if any(not 0.4 <= section[key] <= 500 for section in path for key in ("width_mm", "depth_mm")) or any(abs(p) > 500 for section in path for p in section["position_mm"]):
                raise DomainError("扫掠截面或路径坐标超出范围。", "PLAN_GEOMETRY")
            if any(math.dist(a["position_mm"], b["position_mm"]) < 0.05 for a, b in zip(path, path[1:])):
                raise DomainError("扫掠路径的相邻节点不能重合。", "PLAN_GEOMETRY")
            data["size_mm"] = [max(s["position_mm"][i] + max(s["width_mm"], s["depth_mm"]) / 2 for s in path) - min(s["position_mm"][i] - max(s["width_mm"], s["depth_mm"]) / 2 for s in path) for i in range(3)]
        if step.shape == "loft":
            sections = data["sections"]
            dimensions = [max(s["offset_mm"][i] + s[key] / 2 for s in sections) - min(s["offset_mm"][i] - s[key] / 2 for s in sections) for i, key in enumerate(("width_mm", "depth_mm"))] + [sections[-1]["z_mm"] - sections[0]["z_mm"]]
            if any(not 0.8 <= size <= 500 for size in dimensions):
                raise DomainError("放样截面的实际包围尺寸须在0.8–500毫米以内。", "PLAN_RANGE")
            # 放样截面决定真实包围尺寸；size_mm 是派生值，禁止因重复字段误差而拉伸或拒绝有效截面。
            data["size_mm"] = dimensions
        minimum = [0.8, 0.8, 0.1] if step.shape == "text" else [0.4 if step.shape == "sweep" else 0.8] * 3
        if any(not low <= size <= 500 for low, size in zip(minimum, data["size_mm"])):
            raise DomainError("部件尺寸应在 0.8–500 毫米以内。", "PLAN_RANGE")
        if any(abs(pos) > 500 for pos in data["center_mm"]):
            raise DomainError("部件位置超出范围。", "PLAN_RANGE")
        if any(abs(angle) > 360 for angle in data["rotation_deg"]):
            raise DomainError("旋转角度超出范围。", "PLAN_RANGE")
        if not 0 <= data["bevel_mm"] < min(data["size_mm"]) / 2:
            raise DomainError("圆角超过部件可用尺寸。", "PLAN_RANGE")
        if step.shape == "rounded_box" and not 0 <= data["corner_radius_mm"] < min(data["size_mm"][:2]) / 2:
            raise DomainError("矩形平面圆角半径必须小于宽长的一半，与板厚独立。", "PLAN_RANGE")
        if step.shape == "cup":
            if step.operation != "add":
                raise DomainError("带壁厚圆筒须作为实体添加，挖孔请使用圆柱。", "PLAN_GEOMETRY")
            width, depth, height = data["size_mm"]
            if abs(width - depth) > 0.01 or not 0.8 <= data["wall_mm"] < width / 2 or not 0.8 <= data["bottom_mm"] < height:
                raise DomainError("圆笔筒需要相同的宽深、有效壁厚及底厚。", "PLAN_RANGE")
        if step.shape in ("polygon", "revolve", "cushion"):
            outline = Polygon(data["points"])
            if not outline.is_valid or outline.area <= 0.01 or (step.shape == "revolve" and any(point[0] < 0 for point in data["points"])):
                raise DomainError("轮廓交叉、退化或半径为负数。", "PLAN_GEOMETRY")
            if step.shape == "cushion":
                bounds = outline.bounds
                center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
                if not all(outline.covers(LineString((center, point))) for point in data["points"]):
                    raise DomainError("轮廓曲面需要从中心向边缘连续的轮廓，请拆分复杂凹口。", "PLAN_GEOMETRY")
        if step.shape == "loft":
            sections = data["sections"]
            if any(not 0.8 <= section[key] <= 500 for section in sections for key in ("width_mm", "depth_mm")) or any(b["z_mm"] - a["z_mm"] < 0.05 for a, b in zip(sections, sections[1:])):
                raise DomainError("放样截面需要有效尺寸与严格递增的高度。", "PLAN_GEOMETRY")
            if plan.schema_version >= 4 and step.coordinate_origin == "bounds_center":
                midpoint = [(max(s["offset_mm"][i] + s[key] / 2 for s in sections) + min(s["offset_mm"][i] - s[key] / 2 for s in sections)) / 2 for i, key in enumerate(("width_mm", "depth_mm"))] + [(sections[0]["z_mm"] + sections[-1]["z_mm"]) / 2]
                if any(abs(position) > 0.01 for position in midpoint):
                    raise DomainError(f"放样 {step.id} 选择了 bounds_center，但截面包围中心为 {midpoint} mm。将局部截面围绕零点设计并用 center_mm 放置，或选择 local_origin 保留截面坐标；禁止混用两种坐标语义。", "PLAN_COORDINATES")
        frame = np.eye(4)
        frame[:3, :3] = Rotation.from_euler('xyz', data['rotation_deg'], degrees=True).as_matrix()
        frame[:3, 3] = np.asarray(data['center_mm']) / 1000
        if step.relative_to:
            parent = next((item for item in steps if item['id'] == step.relative_to), None)
            if plan.schema_version < 6 or parent is None:
                raise DomainError("相对部件坐标须使用 v6 并引用更早的部件，不能前向引用或形成环。", "PLAN_COORDINATES")
            frame = np.asarray(parent['frame_m']) @ frame
        if np.any(np.abs(frame[:3, 3]) > 0.5 + 1e-9):
            raise DomainError("组合后的部件世界坐标超出500毫米范围。", "PLAN_RANGE")
        data['frame_m'] = frame.tolist()
        steps.append(data)
    constraints = []
    cups = {step["id"] for step in steps if step["shape"] == "cup"}
    for rule in plan.constraints:
        part, feature = rule.feature.split(".")
        if part != "model" and part not in cups:
            raise DomainError("该特征尚无可用的尺寸检查器。", "PLAN_MEASUREMENT")
        expected = resolve(rule.expected_mm, plan.parameters)
        if expected <= 0:
            raise DomainError("尺寸约束必须为正数。", "PLAN_RANGE")
        constraints.append({"feature": rule.feature, "expected_mm": expected, "max_error_mm": rule.max_error_mm})
    recorded = {rule["feature"] for rule in constraints}
    for step in steps:
        if step["shape"] == "cup":
            for feature in ("wall", "bottom"):
                name = step["id"] + "." + feature
                if name not in recorded:
                    constraints.append({"feature": name, "expected_mm": step[feature + "_mm"], "max_error_mm": 0.01})
    surface = None
    if plan.surface:
        if any(step.shape == "text" for step in plan.steps):
            raise DomainError("真实文字须保留精确实体模式（surface=null），禁止在刻字后体素重塑并抹掉细节。", "PLAN_GEOMETRY")
        surface = {"height_mm": resolve(plan.surface.height_mm, plan.parameters), "voxel_mm": resolve(plan.surface.voxel_mm, plan.parameters), "smooth_iterations": plan.surface.smooth_iterations}
        if not 10 <= surface["height_mm"] <= 500 or not 0.12 <= surface["voxel_mm"] <= 1:
            raise DomainError("参考造型高度须在10–500毫米，曲面精度须在0.12–1毫米。", "PLAN_RANGE")
        if any(rule["feature"] != "model.height" for rule in constraints):
            raise DomainError("等比制作的参考造型只约束成品高度；结构件请保留精确实体模式。", "PLAN_MEASUREMENT")
        if not any(rule["feature"] == "model.height" and abs(rule["expected_mm"] - surface["height_mm"]) < 1e-6 for rule in constraints):
            raise DomainError("参考造型须约束与曲面设置一致的成品高度。", "PLAN_MEASUREMENT")
    source = None
    if plan.source_mesh:
        scale = resolve(plan.source_mesh.scale, plan.parameters, "ratio")
        if not 0.01 <= scale <= 100:
            raise DomainError("原始网格的缩放比例须在0.01–100倍以内。", "PLAN_RANGE")
        source = plan.source_mesh.model_dump() | {"scale": scale}
    return {"schema_version": plan.schema_version, "steps": steps, "constraints": constraints, "surface": surface, "source_mesh": source, "reference_views": [view.model_dump() for view in plan.reference_views]}
