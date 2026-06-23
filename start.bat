@echo off
chcp 65001 >nul
echo ========================================
echo   医院呼叫系统 - 启动脚本
echo ========================================
echo.

cd /d "%~dp0"

:: 检查是否首次运行
if not exist "data\hospital.db" (
    echo [初始化] 首次运行，正在初始化数据库...
    node server/init-db.js
    echo.
)

echo [启动] 正在启动服务...
echo.
start "" "http://localhost:3000/login.html"
node server/app.js
