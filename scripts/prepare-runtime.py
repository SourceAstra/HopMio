"""从 Windows 项目虚拟环境组装可随应用分发的 CPython 运行时。"""
import os
import shutil
import sys
from pathlib import Path

destination = Path(sys.argv[1]).resolve()
artifact_root = Path(__file__).resolve().parents[1] / ".artifacts"
if destination == artifact_root.resolve() or not destination.is_relative_to(artifact_root.resolve()):
    raise SystemExit("Python staging must be inside this project's .artifacts directory.")
base = Path(sys.base_prefix).resolve()
venv = Path(sys.prefix).resolve()
if os.name != "nt" or sys.maxsize <= 2**32:
    raise SystemExit("Windows x64 Python 3 is required to package the Windows release.")
if not (venv / "Scripts" / "python.exe").is_file():
    raise SystemExit("Run this script with the project's .venv/Scripts/python.exe.")

if destination.exists():
    shutil.rmtree(destination)
destination.mkdir(parents=True)
for item in base.iterdir():
    if item.name in {"Lib", "DLLs", "include", "Tools", "Scripts", "tcl", "share"}:
        continue
    target = destination / item.name
    if item.is_dir():
        shutil.copytree(item, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    elif item.is_file():
        shutil.copy2(item, target)
for directory in ("Lib", "DLLs"):
    source = base / directory
    if source.exists():
        shutil.copytree(source, destination / directory, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "site-packages"))
site_packages = venv / "Lib" / "site-packages"
if not site_packages.is_dir():
    raise SystemExit("The Windows virtual environment has no Lib/site-packages.")
shutil.copytree(site_packages, destination / "Lib" / "site-packages", dirs_exist_ok=True,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "tests", "test"))
