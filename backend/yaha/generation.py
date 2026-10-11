"""模型任务编排：本地生成、云端恢复、原始网格与版本防覆盖。"""

from .contracts import DesignSpec, DomainError, Mode
from .geometry.models import generate_local, load_mesh, save_model
from .geometry.templates import fit_and_finish


def start_generation(
    service, identifier, data, concept=False, adjust=False, resume=None
):
    spec = DesignSpec.model_validate(data)
    project = service.projects.get(identifier)
    parent = project["revision_id"]
    if resume and parent != resume.get("base_revision_id"):
        raise DomainError(
            "作品已经切换版本，原云端结果不会覆盖它。请从 Meshy 下载后作为新模型导入。"
        )

    def work(job):
        job.progress(5, "整理想法和材料")
        if concept:
            return {
                "asset": service.meshy.generate(spec, job, concept=True, resume=resume)
            }
        if adjust:
            if not project["model"]:
                raise DomainError("还没有模型可以调整。")
            source_id = project["model"].get(
                "source_stl_id", project["model"]["stl_id"]
            )
            mesh = load_mesh(service.assets.path(source_id))
            mesh = fit_and_finish(mesh, spec)
            origin = "本地调整 · " + project["model"]["origin"]
        elif spec.provider == "meshy" or spec.mode in (Mode.IMAGE, Mode.MULTIVIEW):
            asset = service.meshy.generate(spec, job, resume=resume)
            raw = load_mesh(service.assets.path(asset["id"]))
            if asset["extension"] == ".glb":
                import trimesh

                raw.apply_transform(
                    trimesh.transformations.rotation_matrix(
                        3.141592653589793 / 2, (1, 0, 0)
                    )
                )
            source_id = service.assets.write(
                raw.export(file_type="stl"), ".stl", "原始云端网格.stl"
            )["id"]
            mesh = fit_and_finish(raw, spec)
            origin = "Meshy 云端 AI"
        else:
            raw = generate_local(spec, service.assets, finish=False)
            source_id = service.assets.write(
                raw.export(file_type="stl"), ".stl", "原始模板网格.stl"
            )["id"]
            mesh = fit_and_finish(raw, spec)
            origin = "本地参数造物"
        job.check()
        job.progress(92, "保存新模型版本")
        model = save_model(mesh, service.assets, origin)
        model["source_stl_id"] = source_id
        with service.lock:
            job.check()
            if service.projects.get(identifier)["revision_id"] != parent:
                raise DomainError(
                    "当前作品已经切换版本。这次结果没有覆盖新版本，请重新生成。",
                    "REVISION_CHANGED",
                )
            return {
                "project": service.projects.revision(
                    identifier,
                    spec.model_dump(),
                    model,
                    "云端造物" if "AI" in origin else "调整本地模型",
                )
            }

    return service.jobs.start(
        "concept" if concept else "generate",
        identifier,
        work,
        {"spec": spec.model_dump(), "base_revision_id": parent},
    )
