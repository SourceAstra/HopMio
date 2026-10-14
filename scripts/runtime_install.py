"""官方运行时下载与安全解压的共享边界。"""

import hashlib
import os
import shutil
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USER_ROOT = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "yaha-craft"


def download(url, expected, name):
    cache = (ROOT if (ROOT / "backend").is_dir() else USER_ROOT) / ".artifacts/downloads"
    cache.mkdir(parents=True, exist_ok=True)
    file = cache / name
    def digest(path):
        with path.open("rb") as stream:
            return hashlib.file_digest(stream, "sha256").hexdigest()
    if file.is_file() and digest(file) == expected:
        return file
    partial = file.with_suffix(file.suffix + ".partial")
    request = urllib.request.Request(url, headers={"User-Agent": "YaHa-Craft"})
    print("下载官方运行时：", name, flush=True)
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as stream:
        shutil.copyfileobj(response, stream)
    if digest(partial) != expected:
        raise RuntimeError("发布包 SHA-256 不一致，未安装。")
    partial.replace(file)
    return file


def extract_zip(file, destination, max_bytes=2 * 1024 * 1024 * 1024):
    with zipfile.ZipFile(file) as package:
        if any(Path(entry.filename).is_absolute() or ".." in Path(entry.filename).parts or "\\" in entry.filename or (entry.external_attr >> 16) & 0o170000 == 0o120000 for entry in package.infolist()):
            raise RuntimeError("发布包包含无效路径。")
        if sum(entry.file_size for entry in package.infolist()) > max_bytes:
            raise RuntimeError("发布包解压超过预算。")
        package.extractall(destination)
