"""版本化素材目录；旧浏览器目录由客户端一次性迁移。"""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from ..contracts import DomainError


class Folder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=80)
    emoji: str = Field(default="📁", max_length=16)
    description: str = Field(default="", max_length=300)
    isBuiltIn: Literal[False] = False
    colorScheme: Literal["amber", "blue", "purple", "rose", "emerald", "warm"] = "warm"


class MaterialLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    version: int = Field(default=0, ge=0)
    folders: list[Folder] = Field(default_factory=list, max_length=100)
    assignments: dict[str, str] = Field(default_factory=dict, max_length=10000)


class Materials:
    def __init__(self, db):
        self.db = db

    def get(self):
        return MaterialLibrary.model_validate(self.db.get("settings", "material_library") or {}).model_dump()

    def save(self, value):
        library = MaterialLibrary.model_validate(value)
        ids = [folder.id for folder in library.folders]
        builtins = {"all", "photos", "drawings", "models", "multiview"}
        if len(ids) != len(set(ids)) or set(ids) & builtins:
            raise DomainError("素材文件夹标识重复，请重新命名。", "MATERIAL_FOLDER_INVALID")
        if any(folder not in set(ids) | (builtins - {"all"}) for folder in library.assignments.values()):
            raise DomainError("素材引用了不存在的文件夹，请刷新素材架。", "MATERIAL_FOLDER_INVALID")
        with self.db.lock:
            if self.get()["version"] != library.version:
                raise DomainError("素材目录已被其他页面更新，请刷新后重试。", "MATERIAL_VERSION_CHANGED")
            library.version += 1
            result = library.model_dump()
            self.db.put("settings", "material_library", result)
            return result
