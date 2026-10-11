@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
  ) else (
    echo 找不到 Node.js，请按 README.md 安装开发环境。
    pause
    exit /b 1
  )
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 请先按 README.md 安装项目依赖，再打开网页工作台。
  pause
  exit /b 1
)
node scripts\dev-web.mjs --open
if errorlevel 1 pause
