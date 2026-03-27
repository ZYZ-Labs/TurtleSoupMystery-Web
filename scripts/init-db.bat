@echo off
setlocal

set "ROOT_DIR=%~dp0.."

echo ========================================
echo Turtle Soup Mystery 数据存储初始化
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

echo [INFO] 初始化运行时数据文件...
call npm run init:data
if errorlevel 1 exit /b 1

echo [INFO] 完成。运行时状态文件位于 backend\data\runtime\app-state.json
