from .observations import design
from ..contracts import DesignSpec, DomainError


def start_design(service, identifier, data):
    spec = DesignSpec.model_validate(data)
    parent = service.projects.get(identifier)["revision_id"]

    def work(job):
        plan = design(spec, service.assets, job, service.photo_observer)
        job.check()
        with service.lock:
            if service.projects.get(identifier)["revision_id"] != parent:
                raise DomainError("作品版本已改变，请在当前版本重新检查照片。", "REVISION_CHANGED")
        spec.reconstruction_plan = plan
        spec.assumptions = list(plan.assumptions)
        return {"spec": spec.model_dump(), "base_revision_id": parent}

    return service.jobs.start("plan", identifier, work, {"spec": spec.model_dump(), "base_revision_id": parent})
