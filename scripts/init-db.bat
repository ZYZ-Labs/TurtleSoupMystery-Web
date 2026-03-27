@echo off
setlocal

set "ROOT_DIR=%~dp0.."

echo ========================================
echo Turtle Soup Mystery SQLite 初始化
echo ========================================

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未找到 npm，请先安装 Node.js 22+
  exit /b 1
)

if not exist "%ROOT_DIR%\node_modules" (
  echo [INFO] 正在安装根依赖...
  call npm install
  if errorlevel 1 exit /b 1
)

echo [INFO] 正在初始化 SQLite 数据文件...
call npm run init:data
if errorlevel 1 exit /b 1

echo [INFO] 完成。数据库文件位于 backend\data\runtime\turtle-soup.db
