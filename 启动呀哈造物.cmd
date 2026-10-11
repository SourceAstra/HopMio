@echo off
chcp 65001 >nul
cd /d "%~dp0"
where pnpm >nul 2>nul
if %errorlevel% equ 0 (
  call pnpm dev
) else (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" (
    set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
    call "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" dev
  ) else (
    echo 请安装 Node.js 与 pnpm，然后按 README.md 运行软件。
    pause
  )
)
