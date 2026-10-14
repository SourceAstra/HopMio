"""建模计划 v3：保留精确实体工具，增加可编辑的自由曲面。"""

from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field, model_validator

Number = Annotated[float, Field(allow_inf_nan=False, ge=-2000, le=2000)]
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,47}$")]
ASSUMPTION_LIMIT, ASSUMPTION_CHARS = 8, 300


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Parameter(Contract):
    value: Number
    label: str = Field(min_length=1, max_length=60)
    unit: Literal["mm", "deg", "ratio"] = "mm"
    locked: bool = False


class Reference(Contract):
    parameter: Identifier


class Expression(Contract):
    op: Literal["add", "subtract", "multiply", "divide"]
    args: list[Union[Number, Reference, "Expression"]] = Field(min_length=2, max_length=2)


Scalar = Union[Number, Reference, Expression]


class LoftSection(Contract):
    z_mm: Scalar
    width_mm: Scalar
    depth_mm: Scalar
    offset_mm: tuple[Scalar, Scalar] = (0, 0)
    exponent: float = Field(default=2, ge=1, le=8)


class SweepSection(Contract):
    position_mm: tuple[Scalar, Scalar, Scalar]
    width_mm: Scalar
    depth_mm: Scalar
    twist_deg: Scalar = 0


class SculptFinish(Contract):
    height_mm: Scalar
    voxel_mm: Scalar = 0.25
    smooth_iterations: int = Field(default=8, ge=0, le=24)


class ReferenceView(Contract):
    photo_index: int = Field(ge=0, le=95)
    yaw_deg: float = Field(ge=-360, le=360)
    elevation_deg: float = Field(default=10, ge=-30, le=70)
    region: tuple[float, float, float, float] = (0.02, 0.02, 0.96, 0.96)
    full_object: bool = True

    @model_validator(mode="after")
    def bounds(self):
        x, y, width, height = self.region
        if min(x, y) < 0 or min(width, height) < 0.05 or x + width > 1 or y + height > 1:
            raise ValueError("照片主体框必须位于图像内")
        return self


class GeometryStep(Contract):
    id: Identifier
    name: str = Field(min_length=1, max_length=60)
    operation: Literal["add", "subtract", "intersect"] = "add"
    shape: Literal["box", "cylinder", "ellipsoid", "star", "polygon", "revolve", "loft", "sweep", "cushion", "cup", "usagi"] = Field(description="usagi 导入完整、已融合的角色网格，内含头、身体、耳朵、左右手臂、脚和表情，不是无四肢的素体。内置部位不能通过删除独立步骤移除；需先用局部 subtract 工具切除目标几何，再按需添加替换部件，保持其他区域不变。其他 shape 为单独几何工具。")
    coordinate_origin: Literal["bounds_center", "local_origin"] = Field(description="bounds_center：原始包围盒中心归零后旋转并平移；local_origin：保留原始局部坐标，旋转后平移。")
    size_mm: tuple[Scalar, Scalar, Scalar] | None = None
    center_mm: tuple[Scalar, Scalar, Scalar] = (0, 0, 0)
    rotation_deg: tuple[Scalar, Scalar, Scalar] = (0, 0, 0)
    points: list[tuple[Scalar, Scalar]] = Field(default_factory=list, max_length=64)
    sections: list[LoftSection] = Field(default_factory=list, max_length=16)
    path: list[SweepSection] = Field(default_factory=list, max_length=32)
    cap: Literal["round", "flat"] = "round"
    camber: float = Field(default=0, ge=-1, le=1)
    wall_mm: Scalar = 3
    bottom_mm: Scalar = 4
    bevel_mm: Scalar = 0

    @model_validator(mode="after")
    def profile(self):
        if self.coordinate_origin == "local_origin" and self.shape not in ("loft", "sweep", "revolve"):
            raise ValueError("只有放样、扫掠与旋转轮廓支持 local_origin；其他工具使用 bounds_center")
        if (self.shape == "sweep") != (self.size_mm is None):
            raise ValueError("扫掠由路径和截面确定尺寸；其他工具须提供 size_mm")
        if (self.shape == "sweep" and len(self.path) < 2) or (self.shape != "sweep" and self.path):
            raise ValueError("扫掠需要至少两个截面；其他工具不接收 path")
        if self.shape in ("polygon", "revolve", "cushion") and len(self.points) < 3:
            raise ValueError("轮廓至少需要三个点")
        if self.shape not in ("polygon", "revolve", "cushion") and self.points:
            raise ValueError("只有轮廓工具可以提供 points")
        if (self.shape == "loft" and len(self.sections) < 2) or (self.shape != "loft" and self.sections):
            raise ValueError("放样需要至少两个截面；其他工具不接收截面")
        return self


class Constraint(Contract):
    feature: str = Field(pattern=r"^(model\.(width|depth|height)|[a-zA-Z][a-zA-Z0-9_]{0,47}\.(wall|bottom))$")
    expected_mm: Scalar
    max_error_mm: float = Field(default=0.01, gt=0, le=0.1)


class GeometryPlan(Contract):
    schema_version: Literal[3, 4] = 4
    title: str = Field(min_length=1, max_length=80)
    source_prompt: str = Field(default="", max_length=3000)
    source_asset_ids: list[str] = Field(default_factory=list, max_length=96)
    model_label: str = Field(default="", max_length=100)
    parameters: dict[Identifier, Parameter] = Field(min_length=1, max_length=48)
    steps: list[GeometryStep] = Field(min_length=1, max_length=48)
    surface: SculptFinish | None = None
    reference_views: list[ReferenceView] = Field(default_factory=list, max_length=96)
    constraints: list[Constraint] = Field(default_factory=list, max_length=32)
    assumptions: list[Annotated[str, Field(max_length=ASSUMPTION_CHARS)]] = Field(default_factory=list, max_length=ASSUMPTION_LIMIT)

    @model_validator(mode="before")
    @classmethod
    def migrate(cls, value):
        if not isinstance(value, dict):
            return value
        data = dict(value)
        if data.get("schema_version") == 2:
            data["schema_version"] = 3
        if data.get("schema_version") == 3 and isinstance(data.get("steps"), list):
            # 旧版本保持原位置；新方案必须显式选择坐标原点。
            data["steps"] = [dict(step, coordinate_origin=step.get("coordinate_origin", "local_origin" if step.get("shape") == "sweep" else "bounds_center")) if isinstance(step, dict) else step for step in data["steps"]]
        notes = data.get("assumptions")
        if isinstance(notes, list) and all(isinstance(note, str) and len(note) <= ASSUMPTION_CHARS for note in notes):
            notes = list(notes)
            # 合并相邻说明而不丢弃内容；几何和尺寸校验保持独立。
            for index in range(len(notes) - 1, 0, -1):
                if len(notes) <= ASSUMPTION_LIMIT:
                    break
                if len(notes[index - 1]) + len(notes[index]) + 1 <= ASSUMPTION_CHARS:
                    notes[index - 1] += "\n" + notes.pop(index)
            data["assumptions"] = notes
        return data

    @model_validator(mode="after")
    def identity(self):
        if self.steps[0].operation != "add":
            raise ValueError("第一步必须添加实体")
        ids = [step.id for step in self.steps]
        if len(set(ids)) != len(ids):
            raise ValueError("部件标识重复")
        if sum(step.shape == "usagi" for step in self.steps) > 1:
            raise ValueError("一个方案最多使用一个乌萨奇实体")
        if len({view.photo_index for view in self.reference_views}) != len(self.reference_views):
            raise ValueError("参考照片视角不能重复")
        return self
