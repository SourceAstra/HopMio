import hashlib
from .runtime import configuration
from .observations import design
from ..contracts import DomainError


def prepare(spec, assets, *, job=None, observer=None):
    plan, config = spec.reconstruction_plan, configuration()
    if job is not None:
        if not config["min_photos"] <= len(spec.asset_ids) <= config["max_photos"]:
            raise DomainError(f"一键建模需要{config['min_photos']}–{config['max_photos']}张同一造型的照片。", "RECONSTRUCTION_VIEWS")
        plan = design(spec, assets, job, observer, progress_range=(1, 9))
        spec.reconstruction_plan = plan
        spec.assumptions = list(plan.assumptions)
    if not plan or plan.source_prompt != spec.prompt or plan.source_asset_ids != spec.asset_ids:
        raise DomainError("照片或需求已改变，请重新检查照片。", "PLAN_STALE")
    if not config["min_photos"] <= len(plan.observations) <= config["max_photos"]:
        raise DomainError(f"真实表面重建至少需要{config['min_photos']}张重叠视角照片；当前{len(plan.observations)}张。请补充同一造型的照片。", "RECONSTRUCTION_VIEWS")
    inputs, total = {}, 0
    for index, observation in enumerate(plan.observations):
        data = assets.path(observation.asset_id).read_bytes()
        if hashlib.sha256(data).hexdigest() != observation.sha256:
            raise DomainError("参考照片已改变，请重新检查。", "PLAN_STALE")
        total += len(data)
        if total > config["max_input_mb"] * 1024 * 1024:
            raise DomainError("照片总大小超过重建预算。", "RECONSTRUCTION_BUDGET")
        inputs[f"input_{index:03d}.png"] = data
    return {"surface_plan": plan.model_dump()}, inputs, None
