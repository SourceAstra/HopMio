@echo off
chcp 65001 >nul
setlocal
set "PYTHONUTF8=1"
cd /d "%~dp0"
if exist "backend\requirements-lock.txt" goto source
if exist "..\python\python.exe" (
  "..\python\python.exe" "install-modeling.py"
  goto done
)
echo 找不到项目依赖或随应用发布的 Python 运行时。
exit /b 1
:source
if not exist ".venv\Scripts\python.exe" py -3.12 -m venv .venv
if errorlevel 1 goto done
".venv\Scripts\python.exe" -m pip install --only-binary=:all: -r backend\requirements-lock.txt
if errorlevel 1 goto done
".venv\Scripts\python.exe" "scripts\install-modeling.py"
:done
if errorlevel 1 (
  echo 建模工具安装失败，原安装和作品保留，请查看上方错误。
  pause
  exit /b 1
)
echo 建模、重建和切片工具已安装；重新启动呀哈造物后生效。
pause
