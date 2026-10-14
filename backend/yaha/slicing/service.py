import json
import tempfile
import time
from pathlib import Path
from .runtime import configuration
from .profiles import prepare
from .report import inspect_output
from ..processes import run
from ..contracts import DomainError, PrintProfile
from ..validation import inspect, profile_hash
from ..modeling.runtime import ROOT


def start_slice(service, identifier, data):
    profile, config = PrintProfile.model_validate(data), configuration()
    project = service.projects.get(identifier)
    if not project["model"] or not inspect(project, service.assets, profile)["can_prepare"]:
        raise DomainError("模型尺寸或网格未通过 A1 mini 检查，请先修正。", "SLICE_GEOMETRY")
    revision = project["revision_id"]

    def work(job):
        staging = ROOT / ".artifacts/slice-jobs"
        staging.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=job.id + "-", dir=staging) as temporary:
            directory = Path(temporary)
            path = directory / "model.stl"
            path.write_bytes(service.assets.path(project["model"]["stl_id"]).read_bytes())
            paths, metadata = prepare(profile, config, directory)
            output = directory / "A1-mini.gcode.3mf"
            job.progress(20, "使用 A1 mini 官方配置生成支撑与切片")
            command = [config["executable"], "--load-settings", paths["machine"] + ";" + paths["process"], "--load-filaments", paths["filament"], "--curr-bed-type", config["bed_type"], "--arrange", "1", "--slice", "0", "--export-3mf", str(output), str(path)]
            try:
                run(command, directory, "BambuStudio", time.monotonic() + config["timeout_seconds"], job)
            except (RuntimeError, TimeoutError, OSError) as error:
                raise DomainError(str(error), "SLICE_FAILED") from None
            report = inspect_output(output)
            if report["printer_model_id"] != metadata["printer_model_id"] or float(report["nozzle_mm"] or 0) != profile.nozzle_mm or report["material"] != profile.material:
                raise DomainError("实际切片机型、喷嘴或材料与本次配置不一致。", "SLICE_MACHINE")
            report.update(metadata, profile=profile.model_dump(), profile_hash=profile_hash(profile.model_dump()), revision_id=revision, slicer_version=config["version"], status="sliced", physical_printed=False)
            job.progress(95, "核对真实切片层与打印文件")
            with service.lock:
                job.check()
                if service.projects.get(identifier)["revision_id"] != revision or service.db.get("settings", "profile") not in (None, profile.model_dump()):
                    raise DomainError("模型版本或打印配置已改变，本次切片未覆盖当前打印文件。", "REVISION_CHANGED")
                saved = []
                try:
                    asset = service.assets.write(output.read_bytes(), ".3mf", "A1-mini.gcode.3mf", "sliced")
                    saved.append(asset["id"])
                    report["asset_id"] = asset["id"]
                    receipt = service.assets.write(json.dumps(report, ensure_ascii=False).encode(), ".json", "实际切片报告.json", "slice-report")
                    saved.append(receipt["id"])
                    report["report_id"] = receipt["id"]
                    return job.commit(lambda: {"project": service.projects.update(identifier, slicing=report)})
                except Exception:
                    for asset_id in reversed(saved):
                        service.assets.remove(asset_id)
                    raise

    return service.jobs.start("slice", identifier, work, {"spec": project["spec"], "base_revision_id": revision})
