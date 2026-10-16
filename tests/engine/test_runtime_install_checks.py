"""安装检查兼容 OpenMVS Windows 文件日志，错误退出不得冒充安装成功。"""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import pytest


def installer(monkeypatch, tmp_path, code, output="", log=""):
    scripts = Path(__file__).resolve().parents[2] / "scripts"
    monkeypatch.syspath_prepend(str(scripts))
    spec = importlib.util.spec_from_file_location("install_reconstruction_test", scripts / "install-reconstruction.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    file = tmp_path / "InterfaceCOLMAP.exe"
    file.write_bytes(b"")
    monkeypatch.setattr(module, "TOOLS", ("InterfaceCOLMAP",))
    monkeypatch.setattr(module, "executable", lambda root, name: file)
    def run(args, cwd, **kwargs):
        if log:
            (Path(cwd) / "InterfaceCOLMAP-current.log").write_text(log, encoding="utf-8")
        return SimpleNamespace(returncode=code, stdout=output, stderr="")
    monkeypatch.setattr(module.subprocess, "run", run)
    return module


@pytest.mark.parametrize("source,code", [("pipe", 0), ("log", 1)])
def test_openmvs_help_from_pipe_or_current_log(monkeypatch, tmp_path, source, code):
    help_text = "OpenMVS x64 v2.4.0\nAvailable options: --help"
    module = installer(monkeypatch, tmp_path, code, output=help_text if source == "pipe" else "", log=help_text if source == "log" else "")
    assert module.check(tmp_path) == {"InterfaceCOLMAP": "InterfaceCOLMAP.exe"}


@pytest.mark.parametrize("code,log", [(0, ""), (1, "failed to load DLL"), (-1073741515, "OpenMVS Available options")])
def test_missing_help_or_crash_rejected(monkeypatch, tmp_path, code, log):
    module = installer(monkeypatch, tmp_path, code, log=log)
    (tmp_path / "InterfaceCOLMAP-old.log").write_text("OpenMVS Available options")
    with pytest.raises(RuntimeError, match="启动检查失败"):
        module.check(tmp_path)


@pytest.mark.parametrize("case", ["pipe", "receipt", "missing", "failed", "crash"])
def test_bambu_help_validates_output_or_fresh_receipt(monkeypatch, tmp_path, case):
    scripts = Path(__file__).resolve().parents[2] / "scripts"
    monkeypatch.syspath_prepend(str(scripts))
    spec = importlib.util.spec_from_file_location("install_slicer_test", scripts / "install-slicer.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.sys, "platform", "win32")
    # 不在本次检查目录内的旧回执不得使启动检查通过。
    success = {"return_code": 0, "error_string": "Success.", "prepare_time": 1, "export_time": 0, "plate_index": 0}
    (tmp_path / "result.json").write_text(json.dumps(success))
    def run(args, cwd, **kwargs):
        if case in ("receipt", "failed", "crash"):
            value = success | ({"return_code": 1} if case == "failed" else {})
            (Path(cwd) / "result.json").write_text(json.dumps(value))
        return SimpleNamespace(returncode=-1 if case == "crash" else 0, stdout="--slice --load-settings" if case == "pipe" else "", stderr="")
    monkeypatch.setattr(module.subprocess, "run", run)
    if case in ("pipe", "receipt"):
        module.check_cli(tmp_path / "bambu-studio.exe")
    else:
        with pytest.raises(RuntimeError, match="切片入口检查失败"):
            module.check_cli(tmp_path / "bambu-studio.exe")
