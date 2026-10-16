"""验证应用交接参数，不在自动测试中拉起程序或触发打印。"""
from types import SimpleNamespace
import pytest
from yaha.slicing import handoff
from yaha.contracts import DomainError


@pytest.mark.parametrize("with_model", [False, True])
def test_windows_handoff_uses_installed_executable_and_controlled_asset(monkeypatch, tmp_path, with_model):
    monkeypatch.setattr(handoff.sys, "platform", "win32")
    exe = tmp_path / "Bambu Studio" / "bambu-studio.exe"
    exe.parent.mkdir(); exe.touch()
    file = tmp_path / "作品 有空格.3mf"; file.touch()
    monkeypatch.setattr(handoff, "find_studio", lambda: exe)
    calls = []
    monkeypatch.setattr(handoff.os, "startfile", lambda *args: calls.append(args), raising=False)
    assets = SimpleNamespace(path=lambda identifier: file)
    result = handoff.open_studio(assets, "valid-asset" if with_model else None)
    assert result == {"handed_off": True, "with_model": with_model}
    assert calls == [(str(exe), "open", handoff.subprocess.list2cmdline([str(file)]) if with_model else "", str(exe.parent), 1)]


def test_non_model_asset_is_rejected(monkeypatch, tmp_path):
    monkeypatch.setattr(handoff.sys, "platform", "win32")
    with pytest.raises(DomainError) as error:
        handoff.open_studio(SimpleNamespace(path=lambda identifier: tmp_path / "file.exe"), "asset")
    assert error.value.code == "STUDIO_FORMAT"


def test_launch_error_is_clear(monkeypatch, tmp_path):
    monkeypatch.setattr(handoff.sys, "platform", "win32")
    monkeypatch.setattr(handoff, "find_studio", lambda: tmp_path / "bambu-studio.exe")
    def fail(*args):
        raise OSError("launch failed")
    monkeypatch.setattr(handoff.os, "startfile", fail, raising=False)
    with pytest.raises(DomainError) as error:
        handoff.open_studio(None)
    assert error.value.code == "STUDIO_LAUNCH"
