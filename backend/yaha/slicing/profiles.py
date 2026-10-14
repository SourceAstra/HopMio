"""展开官方继承与 G-code 模板 include，禁止缺项时猜测机器参数。"""

import hashlib
import json
from pathlib import Path
from ..contracts import DomainError


def resolve(root, category, name, sources, stack=()):
    if name in stack or len(stack) > 16 or Path(name).name != name:
        raise DomainError("官方切片参数继承存在循环或无效引用。", "SLICER_PROFILE")
    file = root / category / (name + ".json")
    if not file.is_file():
        raise DomainError("缺少官方切片参数：" + name, "SLICER_PROFILE")
    content = file.read_bytes()
    sources[str(file.relative_to(root))] = hashlib.sha256(content).hexdigest()
    data, result = json.loads(content), {}
    parents = ([data["inherits"]] if data.get("inherits") else []) + data.get("include", [])
    for parent in parents:
        result.update(resolve(root, category, parent, sources, stack + (name,)))
    result.update({key: value for key, value in data.items() if key not in ("inherits", "include")})
    return result


def prepare(profile, config, directory):
    root, sources = Path(config["profiles"]) / "BBL", {}
    nozzle = f"{profile.nozzle_mm:g}"
    machine = resolve(root, "machine", "Bambu Lab A1 mini " + nozzle + " nozzle", sources)
    descriptor = resolve(root, "machine", machine["printer_model"], sources)
    cli_descriptor = root / "machine_full" / (machine["printer_model"] + ".json")
    if not cli_descriptor.is_file() or json.loads(cli_descriptor.read_text()).get("model_id") != descriptor["model_id"]:
        raise DomainError("缺少官方 CLI 机型描述，请重新运行安装切片入口。", "SLICER_PROFILE")
    process = resolve(root, "process", machine["default_print_profile"], sources)
    filament_name = "Generic " + profile.material + " @BBL A1M" + (" 0.2 nozzle" if profile.nozzle_mm == 0.2 else "")
    filament = resolve(root, "filament", filament_name, sources)
    if machine["printer_model"] != "Bambu Lab A1 mini" or machine["nozzle_diameter"] != [nozzle] or float(machine["printable_height"]) != 180:
        raise DomainError("切片参数与 A1 mini 机型或喷嘴不一致。", "SLICER_PROFILE")
    if not float(machine["min_layer_height"][0]) <= profile.layer_mm <= float(machine["max_layer_height"][0]):
        raise DomainError("层高超出当前喷嘴的官方范围，请调整打印配置。", "SLICER_PROFILE")
    process.update(layer_height=f"{profile.layer_mm:g}", enable_support="1" if config["enable_support"] else "0", support_type=config["support_type"], support_on_build_plate_only="0", brim_width=f"{config['brim_width_mm']:g}", wall_loops=str(config["wall_loops"]), sparse_infill_density=config["sparse_infill_density"], post_process="")
    paths = {}
    for kind, values in (("machine", machine), ("process", process), ("filament", filament)):
        path = directory / (kind + ".json")
        path.write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")
        paths[kind] = str(path)
    digest = hashlib.sha256(json.dumps({"machine": machine, "process": process, "filament": filament}, sort_keys=True).encode()).hexdigest()
    return paths, {"printer": machine["name"], "printer_model_id": descriptor["model_id"], "process": process["name"], "filament": filament["name"], "profile_sources": sources, "settings_sha256": digest, "support": config["support_type"] if config["enable_support"] else "disabled", "bed_type": config["bed_type"]}
