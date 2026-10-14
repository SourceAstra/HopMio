"""照片外观审阅契约；通过结论必须包含可追溯的图像依据。"""

import base64
from typing import Literal, Protocol
from pydantic import Field, ValidationError, model_validator
from .contracts import Contract
from .prompts import render_prompts
from ..contracts import DomainError


class VisualFinding(Contract):
    status: Literal["pass", "revise", "unverified"]
    observation: str = Field(min_length=8, max_length=400)
    photo_indices: list[int] = Field(max_length=96)

    @model_validator(mode="after")
    def evidence(self):
        if self.status != "unverified" and not self.photo_indices:
            raise ValueError("通过或修订结论必须引用原始照片")
        if len(set(self.photo_indices)) != len(self.photo_indices):
            raise ValueError("照片证据序号重复")
        return self


class PhotoAssessment(Contract):
    schema_version: Literal["yaha.photo-assessment/v1"] = "yaha.photo-assessment/v1"
    silhouette: VisualFinding
    proportions: VisualFinding
    pose: VisualFinding
    parts: VisualFinding
    details: VisualFinding


class PhotoAssessor(Protocol):
    def assess(self, spec, images: list[str], preview: bytes, observer=None, *, feedback=None, adjustment=None, deadline=None) -> PhotoAssessment: ...


class CloudPhotoAssessor:
    def __init__(self, client):
        self.client = client

    def assess(self, spec, images, preview, observer=None, *, feedback=None, adjustment=None, deadline=None):
        instruction, prompt = render_prompts(spec, feedback=feedback, adjustment=adjustment, assessment_schema=PhotoAssessment.model_json_schema())
        reference = "data:image/png;base64," + base64.b64encode(preview).decode()
        data = self.client.complete(instruction, prompt, images + [reference], observer, deadline=deadline)
        try:
            result = PhotoAssessment.model_validate(data)
            for finding in (result.silhouette, result.proportions, result.pose, result.parts, result.details):
                if any(index < 0 or index >= len(spec.asset_ids) for index in finding.photo_indices):
                    raise ValueError("照片证据序号越界")
            return result
        except (ValidationError, ValueError):
            raise DomainError("照片审阅没有返回完整且有效的观测依据，结果保持草稿。", "PHOTO_REVIEW_INVALID") from None
