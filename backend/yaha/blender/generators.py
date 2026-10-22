"""仅分派随应用安装的生成器版本，数据不能指定模块或脚本路径。"""

from sculpted_top import build as sculpted_top

GENERATORS = {("sculpted_spinning_top", 1): sculpted_top}


def build_generator(reference):
    builder = GENERATORS.get((reference["id"], reference["version"]))
    if builder is None:
        raise ValueError("Blender 未安装该生成器版本。")
    return builder(reference["parameters"])
