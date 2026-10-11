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
node scripts\package-windows.mjs
if errorlevel 1 (
  echo 打包未完成，请查看上面的错误。
  pause
  exit /b 1
)
echo EXE 文件已生成在 release 文件夹。
pause
