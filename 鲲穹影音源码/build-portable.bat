@echo off
echo [1/2] 正在清理旧的便携版构建产物...
if exist dist-portable (
    rd /s /q dist-portable
)

echo [2/2] 正在生成便携版 (win-unpacked)...
call npm run build:portable

if %errorlevel% neq 0 (
    echo [ERROR] 生成失败，请检查上方日志。
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo 便携版生成完成！
echo 产物目录: %~dp0dist-portable\win-unpacked
echo 请对该目录下的 .exe 和 .dll 文件进行签名。
echo ===================================================
pause
