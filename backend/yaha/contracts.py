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

        # 1. 严格白名单投影：仅允许模型声明的合法几何字段，从根本上免疫任何外来/业务字段引发的 extra_forbidden
        allowed = set(cls.model_fields.keys())
        data = {k: v for k, v in data.items() if k in allowed}

        # 2. 模式与 Provider 自动自愈纠偏
        mode_val = str(data.get("mode", "text")).strip().lower()
        if mode_val in [m.value for m in Mode]:
            data["mode"] = Mode(mode_val)
        else:
            data["mode"] = Mode.TEXT

        provider_val = str(data.get("provider", cls.model_fields["provider"].default)).strip().lower()
        if provider_val not in ("local", "parametric", "reconstruction"):
            provider_val = "parametric"
        if data["mode"] not in (Mode.IMAGE, Mode.MULTIVIEW) and provider_val == "reconstruction":
            provider_val = "parametric"
        data["provider"] = provider_val

        # 3. 枚举与布尔值自愈
        policy_val = str(data.get("photo_policy", "auto")).strip().lower()
        data["photo_policy"] = policy_val if policy_val in ("auto", "parameters", "surface") else "auto"

        hole_shape = str(data.get("hole_shape", "round")).strip().lower()
        data["hole_shape"] = hole_shape if hole_shape in ("round", "heart") else "round"

        relief_kind = str(data.get("relief_kind", "relief")).strip().lower()
        data["relief_kind"] = relief_kind if relief_kind in ("relief", "lithophane") else "relief"

        if "base" in data:
            data["base"] = bool(data["base"])
        if "hole" in data:
            data["hole"] = bool(data["hole"])

        # 4. 字符串与列表边界防护截断
        if "prompt" in data:
            data["prompt"] = str(data["prompt"])[:3000]
        if "template" in data:
            data["template"] = str(data["template"])[:50] or "usagi"
        if "asset_ids" in data:
            data["asset_ids"] = [str(x) for x in data["asset_ids"] if isinstance(x, (str, int))][:96] if isinstance(data["asset_ids"], list) else []
        if "assumptions" in data:
            data["assumptions"] = [str(x)[:200] for x in data["assumptions"] if isinstance(x, (str, int))][:20] if isinstance(data["assumptions"], list) else []

        # 5. 关键物理尺寸边界安全钳制（Auto-clamp），杜绝异常中断
        def _clamp(v, low, high, default):
            try:
                num = float(v)
                return max(low, min(high, num))
            except (TypeError, ValueError):
                return default

        if "height_mm" in data:
            data["height_mm"] = _clamp(data["height_mm"], 0.8, 500.0, 80.0)
        if "width_mm" in data:
            data["width_mm"] = _clamp(data["width_mm"], 0.8, 500.0, 48.0)
        if "depth_mm" in data:
            data["depth_mm"] = _clamp(data["depth_mm"], 0.8, 500.0, 36.0)
        if "thickness_mm" in data:
            data["thickness_mm"] = _clamp(data["thickness_mm"], 0.8, 20.0, 3.0)
        if "bottom_mm" in data:
            data["bottom_mm"] = _clamp(data["bottom_mm"], 0.8, 20.0, 4.0)
        if "ear_scale" in data:
            data["ear_scale"] = _clamp(data["ear_scale"], 0.7, 2.0, 1.2)

        # 6. Schema 版本升迁
        data["schema_version"] = 5
        return data

    @model_validator(mode="after")
    def input_budget(self):
        if self.provider == "reconstruction" and self.mode not in (Mode.IMAGE, Mode.MULTIVIEW):
            self.provider = "parametric"
        return self


class ModelAdjustment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    schema_version: Literal[1] = 1
    instruction: str = Field(min_length=1, max_length=2000)
    target_part_id: str | None = Field(default=None, pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,47}$")
    location_asset_id: str | None = Field(default=None, max_length=80)
    location_point: tuple[Annotated[float, Field(ge=0, le=100)], Annotated[float, Field(ge=0, le=100)]] | None = None
    location_point_mm: tuple[Annotated[float, Field(ge=-2000, le=2000)], Annotated[float, Field(ge=-2000, le=2000)], Annotated[float, Field(ge=-2000, le=2000)]] | None = None

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
