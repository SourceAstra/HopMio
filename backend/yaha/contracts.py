"""共享领域数据；所有输入在进入业务前校验。"""

from enum import StrEnum
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .modeling.contracts import GeometryPlan
from .reconstruction.contracts import ReconstructionPlan


class Mode(StrEnum):
    TEXT = "text"
    SILHOUETTE = "silhouette"
    RELIEF = "relief"
    IMAGE = "image"
    MULTIVIEW = "multiview"
    IMPORT = "import"


class DesignSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    schema_version: Literal[1, 2, 3, 4, 5] = 5
    mode: Mode = Mode.TEXT
    prompt: str = Field(default="", max_length=3000)
    template: str = "usagi"
    provider: Literal["local", "parametric", "reconstruction"] = "local"
    photo_policy: Literal["auto", "parameters", "surface"] = "auto"
    modeling_plan: GeometryPlan | None = None
    reconstruction_plan: ReconstructionPlan | None = None
    height_mm: float = Field(default=80, ge=0.8, le=500)
    width_mm: float = Field(default=48, ge=0.8, le=500)
    depth_mm: float = Field(default=36, ge=0.8, le=500)
    thickness_mm: float = Field(default=3, ge=0.8, le=20)
    bottom_mm: float = Field(default=4, ge=0.8, le=20)
    ear_scale: float = Field(default=1.2, ge=0.7, le=2)
    base: bool = False
    hole: bool = False
    hole_shape: Literal["round", "heart"] = "round"
    relief_kind: Literal["relief", "lithophane"] = "relief"
    asset_ids: list[str] = Field(default_factory=list, max_length=96)
    assumptions: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate(cls, value):
        if not isinstance(value, dict):
            return value
        data = dict(value)
        if data.get("schema_version", 1) < 3:
            plan = data.get("modeling_plan")
            if plan and plan.get("schema_version") == 1:
                data["modeling_plan"] = None
            if data.get("provider") not in ("local", "parametric"):
                data["provider"] = "parametric"
            data["schema_version"] = 3
        if data.get("schema_version", 1) in (1, 2, 3, 4):
            data["schema_version"] = 5
        return data

    @model_validator(mode="after")
    def input_budget(self):
        if self.provider == "reconstruction" and self.mode not in (Mode.IMAGE, Mode.MULTIVIEW):
            raise ValueError("表面重建需要照片模式")
        return self


class ModelAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    schema_version: Literal[1] = 1
    instruction: str = Field(min_length=1, max_length=2000)
    location_asset_id: str | None = Field(default=None, max_length=80)
    location_point: tuple[Annotated[float, Field(ge=0, le=100)], Annotated[float, Field(ge=0, le=100)]] | None = None

    @model_validator(mode="after")
    def validate_location(self):
        if self.location_point and not self.location_asset_id:
            raise ValueError("截图位置标记必须绑定截图素材")
        return self


class PrintProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    machine: Literal["A1 mini"] = "A1 mini"
    nozzle_mm: float = Field(default=0.4, ge=0.2, le=1)
    layer_mm: float = Field(default=0.2, ge=0.06, le=0.4)
    material: Literal["PLA", "PETG"] = "PLA"
    margin_mm: float = Field(default=5, ge=0, le=20)


class DomainError(Exception):
    def __init__(self, message: str, code: str = "INVALID_REQUEST"):
        super().__init__(message)
        self.code = code
