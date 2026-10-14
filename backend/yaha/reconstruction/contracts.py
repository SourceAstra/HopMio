from typing import Literal
from pydantic import ConfigDict, Field, model_validator
from ..modeling.contracts import Contract, Parameter


class ReconstructionQuality(Contract):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)
    schema_version: Literal["yaha.reconstruction-quality/v1"] = "yaha.reconstruction-quality/v1"
    input_views: int = Field(ge=1, le=96)
    registered_views: int = Field(ge=1, le=96)
    sparse_points: int = Field(ge=1)
    mean_reprojection_error_px: float = Field(ge=0)
    unregistered_asset_ids: list[str] = Field(default_factory=list, max_length=96)
    registered_asset_ids: list[str] = Field(default_factory=list, max_length=96)
    registration_ratio: float = Field(default=0, ge=0, le=1)
    reference_asset_id: str | None = None
    warnings: list[str] = Field(default_factory=list, max_length=8)
    scale_status: Literal["target_height", "reference_distance"] | None = None
    removed_components: int = Field(default=0, ge=0)
    removed_volume_ratio: float = Field(default=0, ge=0, le=1)
    textured_surface_ratio: float | None = Field(default=None, ge=0, le=1)
    untextured_faces: int | None = Field(default=None, ge=0)
    repairs: list[str] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def view_count(self):
        if self.registered_views > self.input_views or len(self.unregistered_asset_ids) != self.input_views - self.registered_views:
            raise ValueError("配准计数与输入视角不一致")
        if self.registered_asset_ids and (len(set(self.registered_asset_ids)) != self.registered_views or set(self.registered_asset_ids) & set(self.unregistered_asset_ids)):
            raise ValueError("已配准照片与未配准照片不一致")
        if self.reference_asset_id and self.registered_asset_ids and self.reference_asset_id not in self.registered_asset_ids:
            raise ValueError("参考照片未配准")
        self.registration_ratio = self.registered_views / self.input_views
        return self


class PhotoObservation(Contract):
    asset_id: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    width_px: int = Field(ge=32, le=8192)
    height_px: int = Field(ge=32, le=8192)
    blur_score: float = Field(ge=0)
    feature_count: int = Field(ge=0)
    region: tuple[float, float, float, float] = (0.02, 0.02, 0.96, 0.96)
    warnings: list[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def bounds(self):
        x, y, width, height = self.region
        if min(x, y) < 0 or min(width, height) < 0.05 or x + width > 1.000001 or y + height > 1.000001:
            raise ValueError("主体范围超出照片")
        return self


class ScaleReference(Contract):
    asset_id: str
    points: tuple[tuple[float, float], tuple[float, float]]
    distance_mm: float = Field(gt=0, le=10000)

    @model_validator(mode="after")
    def bounds(self):
        if any(not 0 <= coordinate <= 1 for point in self.points for coordinate in point):
            raise ValueError("标尺端点超出照片")
        if sum((a - b) ** 2 for a, b in zip(*self.points)) < 0.0001:
            raise ValueError("标尺两端过于接近")
        return self


class ReconstructionPlan(Contract):
    schema_version: Literal[1] = 1
    kind: Literal["surface"] = "surface"
    title: str = "照片表面重建"
    source_prompt: str = Field(default="", max_length=3000)
    source_asset_ids: list[str] = Field(min_length=1, max_length=96)
    observations: list[PhotoObservation] = Field(min_length=1, max_length=96)
    parameters: dict[str, Parameter] = Field(min_length=1, max_length=16)
    scale_reference: ScaleReference | None = None
    assumptions: list[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def identity(self):
        if [item.asset_id for item in self.observations] != self.source_asset_ids or len(set(self.source_asset_ids)) != len(self.source_asset_ids):
            raise ValueError("照片观测与来源不一致")
        required = {"height", "voxel", "rotate_x", "rotate_y", "rotate_z", "base_h", "base_margin", "scale_ratio"}
        if set(self.parameters) != required:
            raise ValueError("重建参数不完整")
        ranges = {"height": (10, 500, "mm"), "voxel": (0.08, 2, "mm"), "base_h": (0, 20, "mm"), "base_margin": (0, 20, "mm"), "scale_ratio": (0.001, 10, "ratio")}
        for name, parameter in self.parameters.items():
            low, high, unit = ranges.get(name, (-180, 180, "deg"))
            if parameter.unit != unit or not low <= parameter.value <= high:
                raise ValueError("重建参数范围或单位无效：" + name)
        if self.parameters["base_h"].value >= self.parameters["height"].value:
            raise ValueError("底座不能超过作品总高")
        if self.scale_reference and self.scale_reference.asset_id != self.source_asset_ids[0]:
            raise ValueError("标尺必须来自第一张参考照片")
        return self
