#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
PYTHON_BIN="${YAHA_PYTHON:-.venv/bin/python}"
"$PYTHON_BIN" -m pip install --only-binary=:all: -r backend/requirements-lock.txt
"$PYTHON_BIN" scripts/install-modeling.py
