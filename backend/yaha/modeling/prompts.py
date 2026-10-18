"""从本项目配置渲染建模提示词，Schema 始终来自当前契约。"""

import json
from string import Template
import yaml
from .contracts import GeometryPlan
from .runtime import ROOT
from ..contracts import DomainError


def render_prompts(spec, correction=None, *, review=False, adjustment=None, model_view_count=0, location_image_count=0, reference_image_count=0, feedback=None, assessment_schema=None):
    file = ROOT / "config/modeling-prompts.yaml"
    try:
        if file.stat().st_size > 64 * 1024:
            raise ValueError("提示词配置过大")
        data = yaml.safe_load(file.read_text(encoding="utf-8"))
        if data["schema_version"] != "yaha.modeling-prompts/v1":
            raise ValueError("提示词版本不支持")
        if any(not isinstance(data[key], str) or not data[key].strip() for key in ("system_prompt", "user_prompt", "default_description")):
            raise ValueError("提示词不能为空")
        dimensions = {"height_mm": spec.height_mm}
        if spec.mode not in ("image", "multiview"):
            dimensions.update(width_mm=spec.width_mm, depth_mm=spec.depth_mm)
        context = {
            "schema": json.dumps(GeometryPlan.model_json_schema(), ensure_ascii=False),
            "description": spec.prompt.strip() or data["default_description"],
            "dimensions": json.dumps(dimensions),
            "photo_count": len(spec.asset_ids),
            "base": "需要底座" if spec.base else "无需底座",
            "previous_plan": json.dumps(spec.modeling_plan.model_dump(), ensure_ascii=False) if spec.modeling_plan else "无现有造型，创建第一版",
            "adjustment": adjustment or "",
            "model_view_count": model_view_count,
            "reference_image_count": reference_image_count,
            "location_image_count": location_image_count,
            "review_feedback": json.dumps(feedback or {}, ensure_ascii=False),
            "assessment_schema": json.dumps(assessment_schema, ensure_ascii=False),
        }
        if spec.modeling_plan and spec.modeling_plan.source_mesh:
            context["description"] += "\n当前为原网格编辑：输出 schema_version=7，原样保留 source_mesh.asset_id/sha256，以该真实网格为主体；steps 仅添加必要的局部工具，可从 subtract 开始。不得用基本几何重新拼出主体，surface 必须为 null。source_mesh.scale 只在明确要求整体缩放时更改；未要求改变的原工具与尺寸须保留。工具使用原制造 STL 的坐标：毫米、Z向上、底面Z=0。"
            context["adjustment"] += "\n必须保留现有 source_mesh 身份，使用 v7 网格编辑；不得替换主体或全局重塑。"
        if correction:
            context.update(correction)
            return Template(data["system_prompt"]).substitute(context), Template(data["repair_prompt"]).substitute(context)
        if assessment_schema:
            return tuple(Template(data[key]).substitute(context) for key in ("assessment_system_prompt", "assessment_prompt"))
        prompt_key = "assessment_prompt" if assessment_schema else "review_prompt" if review else "adjust_prompt" if adjustment else "user_prompt"
        return tuple(Template(data[key]).substitute(context) for key in ("system_prompt", prompt_key))
    except (OSError, ValueError, TypeError, KeyError, yaml.YAMLError):
        raise DomainError("无法读取 config/modeling-prompts.yaml，请检查版本、提示词和变量名称。", "AI_PROMPT_CONFIG") from None
