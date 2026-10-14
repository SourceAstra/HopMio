"""作品包版本、角色与预算；导入导出共用同一契约。"""

MAX_PACKAGE_BYTES = 256 * 1024 * 1024
MAX_UNPACKED_BYTES = 512 * 1024 * 1024
MODEL_FILES = {
    "source.stl": ("source_stl_id", "mm"),
    "source.blend": ("blend_id", "m"),
    "manifest.json": ("manifest_id", None),
    "source.glb": ("source_glb_id", "m"),
    "manufacturing.glb": ("manufacturing_glb_id", "m"),
    "comparison.png": ("comparison_id", "pixels"),
    "reference.png": ("reference_id", "pixels"),
}


def remap_observations(value, mapping):
    if isinstance(value, list):
        return [remap_observations(item, mapping) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: mapping.get(item, item) if key == "asset_id" else [mapping.get(identifier, identifier) for identifier in item] if key.endswith("asset_ids") else remap_observations(item, mapping) for key, item in value.items()}
