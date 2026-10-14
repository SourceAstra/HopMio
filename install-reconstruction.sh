#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
PYTHON_BIN="${YAHA_PYTHON:-.venv/bin/python}"
"$PYTHON_BIN" -m pip install --only-binary=:all: 'pycolmap==4.2.1'
"$PYTHON_BIN" scripts/install-reconstruction.py
