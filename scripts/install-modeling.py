#!/usr/bin/env python3
"""统一安装三维建模、表面重建和 A1 mini 切片的官方运行时。"""

import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
for name in ("blender", "reconstruction", "slicer"):
    subprocess.run([sys.executable, str(root / ("install-" + name + ".py"))], check=True)
print("建模工具安装完成。重启呀哈造物后，安装状态会显示在设置中。")
