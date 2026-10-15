import hashlib
import json
import sys
import tempfile
import threading
import time
import io
import zipfile
from pathlib import Path
from PIL import Image
import numpy as np
import trimesh
from ..processes import run
from .bundling import pack_glb
from .source_cache import digest, restore, save
from .contracts import ReconstructionQuality
from .runtime import ROOT, availability, configuration, tool_paths
from ..contracts import DomainError


class SurfaceBackend:
    def __init__(self, modeler):
        self.modeler = modeler
        self.slot = threading.Semaphore(1)

    def status(self):
        status = availability()
        if status["available"] and not self.modeler.status()["available"]:
            status.update(available=False, message=self.modeler.status()["message"])
        return status

    def build(self, request, inputs, job):
        while not self.slot.acquire(timeout=0.2):
            job.check()
        try:
            return self._execute(request, inputs, job)
        except (RuntimeError, TimeoutError, OSError, ValueError, KeyError) as error:
            raise DomainError(str(error)[:600], "RECONSTRUCTION_FAILED") from None
        finally:
            self.slot.release()

    def _execute(self, request, inputs, job):
        job.record(reconstruction_plan=request["surface_plan"])
        config = configuration()
        tools = tool_paths(config)
        staging = ROOT / ".artifacts/reconstruction-jobs"
        staging.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=job.id + "-", dir=staging) as temporary:
            root = Path(temporary)
            deadline = time.monotonic() + config["timeout_seconds"]
            for name, content in inputs.items():
                (root / name).write_bytes(content)
            (root / "plan.json").write_text(json.dumps(request["surface_plan"], ensure_ascii=False), encoding="utf-8")
            (root / "config.json").write_text(json.dumps(config), encoding="utf-8")
            worker = Path(__file__).with_name("sfm_worker.py")
            content = worker.read_bytes()
            (root / "sfm_worker.py").write_bytes(content)
            stages = (
                ("InterfaceCOLMAP", 48, "转换已配准的照片观测", ["-i", "dense", "-o", "scene.mvs", "--binary", "0", "--image-folder", str(root / "dense/images")]),
                ("DensifyPointCloud", 55, "恢复多视角共同观测的表面", ["-i", "scene.mvs", "-o", "dense.mvs", "--mask-path", str(root / "dense_masks"), "--ignore-mask-label", "0", "--resolution-level", str(config["depth_resolution_level"]), "--number-views-fuse", "3"]),
                ("ReconstructMesh", 65, "建立原始扫描网格", ["-i", "dense.mvs", "-o", "mesh.mvs", "--close-holes", "0"]),
                ("RefineMesh", 72, "按照片细化观测表面", ["-i", "mesh.mvs", "-o", "refined.mvs", "--close-holes", "0", "--decimate", "1", "--resolution-level", str(config["depth_resolution_level"])]),
                ("TextureMesh", 78, "保存真实照片纹理", ["-i", "refined.mvs", "-o", "source.mvs", "--export-type", "glb", "--close-holes", "0", "--ignore-mask-label", "0", "--max-texture-size", str(config["max_texture_size"])]),
            )
            fingerprints = {}
            for name, path in tools.items():
                with open(path, "rb") as stream:
                    fingerprints[name] = hashlib.file_digest(stream, "sha256").hexdigest()
            observation_plan = {key: value for key, value in request["surface_plan"].items() if key != "parameters"}
            key = digest({"plan": observation_plan, "inputs": {name: hashlib.sha256(data).hexdigest() for name, data in inputs.items()}, "config": {name: value for name, value in config.items() if name not in ("voxel_mm", "max_removed_volume_ratio", "min_textured_surface_ratio")}, "worker": hashlib.sha256(content).hexdigest(), "adapter": hashlib.sha256(Path(__file__).with_name("bundling.py").read_bytes()).hexdigest(), "tools": fingerprints, "stages": [[name, [arg.replace(str(root), "$WORK") for arg in args]] for name, _, _, args in stages]})
            cached = restore(key, root)
            if cached is None:
                self._observe(root, config, tools, stages, content, deadline, job)
                cached = save(key, root, job.id)
            else:
                job.progress(78, "复用已校验的原始扫描，应用当前制造参数")
            camera = json.loads((root / "camera.json").read_text())
            quality = json.loads((root / "quality.json").read_text())
            quality = ReconstructionQuality.model_validate(quality).model_dump()
            quality["source_cache"] = {"key": key, "origin_job_id": cached["job_id"], "reused": cached["job_id"] != job.id, "tools": fingerprints}
            job.record(reconstruction_quality=quality, photo_matching=quality.get("photo_matching"))
            packed = (root / "source.glb").read_bytes()
            values = {name: parameter["value"] for name, parameter in request["surface_plan"]["parameters"].items()}
            constraints = [] if camera.get("scale_reference") else [{"feature": "model.height", "expected_mm": values["height"], "max_error_mm": 0.01}]
            payload = {"builder": "surface", "surface_plan": request["surface_plan"], "quality": quality, "surface_parameters": values, "constraints": constraints, "max_removed_volume_ratio": config["max_removed_volume_ratio"], "min_textured_surface_ratio": config["min_textured_surface_ratio"], "deadline": deadline}
            data = {"source.glb": packed, "camera.json": json.dumps(camera).encode(), "reference.png": (root / "reference.png").read_bytes(), "photos.zip": (root / "photos.zip").read_bytes()}
            built = self.modeler.build(payload, data, job)
            built.manifest["reconstruction"] = quality | built.manifest.get("reconstruction", {})
            return built

    def _observe(self, root, config, tools, stages, content, deadline, job):
        try:
            run([sys.executable, str(root / "sfm_worker.py"), str(root)], root, "camera", deadline, job)
        finally:
            if (root / "matching.json").is_file():
                job.record(photo_matching=json.loads((root / "matching.json").read_text()))
            if (root / "quality.json").is_file():
                job.record(reconstruction_quality=json.loads((root / "quality.json").read_text()))
        camera = json.loads((root / "camera.json").read_text())
        quality = json.loads((root / "quality.json").read_text())
        for name, percent, message, args in stages:
            job.check()
            (root / "progress.json").unlink(missing_ok=True)
            job.progress(percent, message)
            run([tools[name], "--max-threads", str(config["threads"]), "--archive-type", "2", *args], root, name, deadline, job)
            expected = root / args[args.index("-o") + 1]
            if not expected.is_file() or not expected.stat().st_size:
                raise DomainError(name + " 没有保存约定的场景产物，后续操作已停止。", "RECONSTRUCTION_OUTPUT")
            with expected.open("rb") as stream:
                job.tool_record(name, output={"file": expected.name, "bytes": expected.stat().st_size, "sha256": hashlib.file_digest(stream, "sha256").hexdigest()})
            if name == "DensifyPointCloud":
                points = expected.with_suffix(".ply")
                cloud = trimesh.load(points, process=False) if points.is_file() else None
                count = len(cloud.vertices) if isinstance(cloud, trimesh.PointCloud) else 0
                quality["dense_points"] = count
                job.record(reconstruction_quality=quality)
                if count < 3 or not np.isfinite(cloud.vertices).all():
                    raise DomainError(f"稠密重建只得到{count}个表面点，无法建立真实网格。相机配准通过不代表恢复了共同表面；请检查相邻视角、相机参数与主体范围。", "RECONSTRUCTION_DENSE")
                (root / "quality.json").write_text(json.dumps(quality), encoding="utf-8")
        source = root / "source.glb"
        if not source.is_file() or not source.stat().st_size:
            raise DomainError("表面恢复没有输出扫描网格，请补拍清晰且重叠的照片。", "RECONSTRUCTION_SURFACE")
        with Image.open(root / "dense/images" / camera["name"]) as image:
            image.thumbnail((960, 960))
            sx, sy = image.width / camera["width"], image.height / camera["height"]
            camera["K"][0] = [value * sx for value in camera["K"][0]]
            camera["K"][1] = [value * sy for value in camera["K"][1]]
            if camera.get("scale_reference"):
                camera["scale_reference"]["points_px"] = [[x * sx, y * sy] for x, y in camera["scale_reference"]["points_px"]]
            camera.update(width=image.width, height=image.height)
            image.convert("RGB").save(root / "reference.png")
        packed, textures = pack_glb(source)
        with zipfile.ZipFile(root / "photos.zip", "w", zipfile.ZIP_STORED) as archive:
            for view in camera["views"]:
                with Image.open(root / "dense/images" / view["name"]) as image:
                    image.thumbnail((config["photo_texture_size"], config["photo_texture_size"]))
                    sx, sy = image.width / view["width"], image.height / view["height"]
                    view["K"][0] = [value * sx for value in view["K"][0]]
                    view["K"][1] = [value * sy for value in view["K"][1]]
                    view.update(width=image.width, height=image.height)
                    buffer = io.BytesIO()
                    image.convert("RGB").save(buffer, format="JPEG", quality=90)
                    archive.writestr(view["name"], buffer.getvalue())
        quality.update(camera=camera, source_sha256=hashlib.sha256(packed).hexdigest(), textures=textures, worker_sha256=hashlib.sha256(content).hexdigest(), strategy="COLMAP CPU / OpenMVS CPU", source_units="relative", scale_status="reference_distance" if camera.get("scale_reference") else "target_height", repairs=["制造副本焊接纹理接缝、补小孔与体素闭合；扫描原件保留"])
        (root / "source.glb").write_bytes(packed)
        (root / "camera.json").write_text(json.dumps(camera), encoding="utf-8")
        (root / "quality.json").write_text(json.dumps(quality), encoding="utf-8")
