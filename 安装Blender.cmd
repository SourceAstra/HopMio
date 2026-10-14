@echo off
chcp 65001 >nul
setlocal
set "PYTHONUTF8=1"
cd /d "%~dp0"
set "YAHA_INSTALLER=scripts\install-blender.py"
if not exist "%YAHA_INSTALLER%" set "YAHA_INSTALLER=install-blender.py"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" "%YAHA_INSTALLER%"
) else if exist "..\python\python.exe" (
  "..\python\python.exe" "%YAHA_INSTALLER%"
) else (
  py -3.12 "%YAHA_INSTALLER%"
)
if errorlevel 1 (
  echo Blender 安装失败，请查看上方错误。需要 Python 3.12 或已安装的呀哈造物引擎。
  pause
  exit /b 1
)
echo Blender 已安装，重新启动呀哈造物后生效。
pause
