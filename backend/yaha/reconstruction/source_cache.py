"""有界观测缓存：制造参数变化复用同一扫描，文件摘要不符即拒绝消费。"""

import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from .runtime import ROOT

FILES = ("source.glb", "camera.json", "reference.png", "quality.json", "photos.zip")
DIRECTORY = ROOT / ".artifacts/reconstruction-cache"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def restore(key, destination):
    root = DIRECTORY / key
    if not (root / "cache.json").is_file():
        return None
    manifest = json.loads((root / "cache.json").read_text())
    if set(manifest["files"]) != set(FILES):
        raise ValueError("观测缓存文件清单无效。")
    for name, expected in manifest["files"].items():
        file = root / name
        if not file.is_file() or file.stat().st_size != expected["bytes"]:
            raise ValueError("观测缓存文件缺失或大小改变。")
        with file.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != expected["sha256"]:
                raise ValueError("观测缓存文件摘要改变。")
        shutil.copyfile(file, destination / name)
    return manifest


def save(key, source, job_id):
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": 1, "job_id": job_id, "files": {}}
    with tempfile.TemporaryDirectory(prefix="save-", dir=DIRECTORY) as temporary:
        staging = Path(temporary)
        for name in FILES:
            data = (source / name).read_bytes()
            if len(data) > (128 if name == "photos.zip" else 40) * 1024 * 1024:
                raise ValueError("观测缓存文件超出大小预算。")
            (staging / name).write_bytes(data)
            manifest["files"][name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        (staging / "cache.json").write_text(json.dumps(manifest), encoding="utf-8")
        staging.replace(DIRECTORY / key)
    entries = sorted((p for p in DIRECTORY.iterdir() if len(p.name) == 64 and all(c in "0123456789abcdef" for c in p.name) and p.is_dir() and not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
    for entry in entries[3:]:
        shutil.rmtree(entry)
    return manifest
