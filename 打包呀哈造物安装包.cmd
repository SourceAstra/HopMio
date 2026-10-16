@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 24，并按 README 安装项目依赖。
  pause
  exit /b 1
)
node scripts\package-windows.mjs
if errorlevel 1 (
  echo 安装包生成失败，请查看上方错误。
  pause
  exit /b 1
)
echo 安装包已生成到 release 目录。
pause
