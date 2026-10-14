#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec "${YAHA_PYTHON:-python3.12}" scripts/install-blender.py
