#!/usr/bin/env python3
"""统一安装三维建模、表面重建和 A1 mini 切片的官方运行时。"""

import subprocess
import sys
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent
    stages = (("blender", "Blender 建模"), ("reconstruction", "OpenMVS 表面重建"), ("slicer", "Bambu Studio 切片"))
    for index, (name, label) in enumerate(stages, 1):
        print(f"[{index}/{len(stages)}] 安装与检查 {label}", flush=True)
        result = subprocess.run([sys.executable, str(root / ("install-" + name + ".py"))])
        if result.returncode:
            print(f"{label} 未完成，请处理上方错误后重新运行；已安装的工具会复用。", file=sys.stderr)
            return 1
    print("建模工具安装完成。重启呀哈造物后，安装状态会显示在设置中。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
