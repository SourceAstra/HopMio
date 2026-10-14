"""应用与建模软件之间的稳定边界。"""

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class BuildResult:
    files: dict[str, bytes]
    manifest: dict
    private_files: dict[str, bytes] = field(default_factory=dict)


class ModelingBackend(Protocol):
    def status(self) -> dict: ...
    def build(self, request: dict, inputs: dict, job) -> BuildResult: ...
