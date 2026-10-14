@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在启动 呀哈造物 · YaHa...
if exist "bin\yaha.exe" (
    bin\yaha.exe -port 5173 -data .state -web dist
) else if exist "bin\hopmio.exe" (
    bin\hopmio.exe -port 5173 -data .state -web dist
) else (
    where go >nul 2>nul
    if errorlevel 1 (
        echo 找不到 bin\yaha.exe，且未安装 Go。源码启动请先安装 Go，发布版请使用完整发行包。
        pause
        exit /b 1
    )
    go run .\cmd\server -port 5173 -data .state -web dist
)
if errorlevel 1 pause
