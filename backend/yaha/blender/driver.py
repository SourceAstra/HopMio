"""在 Blender 内运行；业务协议通过文件传递，日志与产物分离。"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tools import build_scene
from exporting import export_scene
from surface import build_surface, export_surface


def ordinary_exports(files, directory):
    preview = directory / "comparison.png"
    return files | ({"comparison": preview} if preview.is_file() else {}), {}


BUILDERS = {"geometry": (build_scene, ordinary_exports), "surface": (build_surface, export_surface)}


def progress(directory, percent, stage):
    temporary = directory / "progress.new"
    temporary.write_text(json.dumps({"percent": percent, "stage": stage}), encoding="utf-8")
    temporary.replace(directory / "progress.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    directory = Path(args.output_dir).resolve()
    request = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    progress(directory, 15, "Blender 正在建立部件")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1
    scene.unit_settings.length_unit = "MILLIMETERS"
    try:
        build, finish = BUILDERS[request.get("builder", "geometry")]
        obj, features = build(request, lambda percent, stage: progress(directory, percent, stage), directory)
        progress(directory, 85, "Blender 正在导出真实网格与源工程")
        surface_options = request.get("plan", {}).get("surface")
        files, size, topology = export_scene(obj, directory, request["max_faces"], features, clean_flat=bool(surface_options), voxel_mm=surface_options["voxel_mm"] if surface_options else 0, preview_views=request.get("preview_views", False), progress=lambda percent, stage: progress(directory, percent, stage), max_removed_ratio=request.get("max_removed_volume_ratio") if request.get("builder") == "surface" else None)
        files, reconstruction = finish(files, directory)
        print("YaHa topology: " + json.dumps(topology), flush=True)
        manifest = {
            "schema_version": 1,
            "job_id": request["job_id"],
            "plan_digest": request["plan_digest"],
            "blender_version": bpy.app.version_string,
            "size_mm": size,
            "topology": topology,
            "features": features,
            "lettering_effects": json.loads(scene.get("yaha_lettering_effects", "[]")),
            "boolean_effects": json.loads(scene.get("yaha_boolean_effects", "[]")),
            "finishing": json.loads(scene.get("yaha_finishing", "{}")),
            "constraints": request.get("constraints", request.get("plan", {}).get("constraints", [])),
            "reconstruction": reconstruction,
            "review_render_error": scene.get("yaha_review_error"),
            "review_views": json.loads(scene.get("yaha_review_views", "[]")),
            "export_shift_m": list(scene["yaha_export_shift_m"]),
            "micro_cleanup": json.loads(scene.get("yaha_micro_cleanup", "{}")),
            "private_outputs": {"body": "shape-body.json"} if (directory / "shape-body.json").is_file() else {},
            "outputs": {name: {"file": path.name, "extension": path.suffix, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size} for name, path in files.items()},
            "units": {name: "mm" if path.suffix == ".stl" else "pixels" if path.suffix == ".png" else "m" for name, path in files.items()},
        }
        (directory / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        progress(directory, 90, "导出完成，正在等待尺寸复测")
    except Exception as error:
        (directory / "error.json").write_text(json.dumps({"message": str(error)[:500]}), encoding="utf-8")
        raise


main()
