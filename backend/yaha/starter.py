"""升级内置主题示例，旧版本留在作品柜，不替换用户自己的作品。"""

from .contracts import DesignSpec
from .geometry.models import generate_local, save_model
from .geometry.templates import fit_and_finish

THEME_VERSION = "usagi-reference-v2"
STARTER_NAME = "乌萨奇的第一份礼物"


def ensure_starter(service):
    projects = service.projects.list()
    if not projects:
        spec = DesignSpec(
            template="usagi",
            prompt="乌萨奇摆件：细长耳朵、大头短身、眉毛、开心的 ω 嘴和脸颊刻线。",
            width_mm=48,
            depth_mm=36,
        )
        project = service.projects.create(STARTER_NAME, spec.model_dump())
    else:
        project = next(
            (
                p
                for p in projects
                if p["name"] == STARTER_NAME
                and p.get("starter_theme") != THEME_VERSION
                and p["spec"]["template"] in ("bunny", "usagi")
                and p["spec"]["provider"] == "local"
            ),
            None,
        )
        if not project:
            return
        spec = DesignSpec.model_validate(project["spec"])
        spec.template = "usagi"
        spec.width_mm = 48
        spec.depth_mm = 36
        spec.prompt = "乌萨奇摆件：细长耳朵、大头短身、眉毛、开心的 ω 嘴和脸颊刻线。"
    raw = generate_local(spec, service.assets, finish=False)
    source = service.assets.write(
        raw.export(file_type="stl"), ".stl", "乌萨奇原始网格.stl"
    )
    model = save_model(
        fit_and_finish(raw, spec), service.assets, "乌萨奇主题 · 本地示例"
    )
    model["source_stl_id"] = source["id"]
    service.projects.revision(
        project["id"],
        spec.model_dump(),
        model,
        "乌萨奇小屋的欢迎礼物"
        if not project["model"]
        else "按确认效果图替换为乌萨奇，旧版保留",
    )
    service.projects.update(project["id"], starter_theme=THEME_VERSION)
