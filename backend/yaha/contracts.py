"""共享领域数据；所有输入在进入业务前校验。"""

from enum import StrEnum
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Mode(StrEnum):
    TEXT = "text"
    SILHOUETTE = "silhouette"
    RELIEF = "relief"
    IMAGE = "image"
    MULTIVIEW = "multiview"
    IMPORT = "import"


class DesignSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    mode: Mode = Mode.TEXT
    prompt: str = Field(default="", max_length=3000)
    template: str = "usagi"
    provider: Literal["local", "meshy"] = "local"
    height_mm: float = Field(default=80, ge=10, le=500)
    width_mm: float = Field(default=48, ge=10, le=500)
    depth_mm: float = Field(default=36, ge=5, le=500)
    thickness_mm: float = Field(default=3, ge=0.8, le=20)
    ear_scale: float = Field(default=1.2, ge=0.7, le=2)
    base: bool = False
    hole: bool = False
    hole_shape: Literal["round", "heart"] = "round"
    relief_kind: Literal["relief", "lithophane"] = "relief"
    asset_ids: list[str] = Field(default_factory=list, max_length=4)
    assumptions: list[str] = Field(default_factory=list)


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
