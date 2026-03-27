@echo off
:: 功能：鲲穹影音一键打包脚本
:: 作者：FullStack-Guardian
:: 更新时间：2026-02-02

echo [1/3] 正在清理旧的构建产物...
if exist dist-v10 (
    rd /s /q dist-v10
)

echo [2/3] 正在执行打包命令 (electron-builder)...
call npm run pack

if %errorlevel% neq 0 (
    echo [ERROR] 打包失败，请检查上方日志。
    pause
    exit /b %errorlevel%
)

echo [3/3] 打包完成！
echo 产物目录: e:\360MoveData\Users\win10\Desktop\鲲穹AI播放器3\鲲穹AI播放器源码\dist-v10
echo 可执行文件: 鲲穹影音 Setup 1.0.3.exe
pause
