#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "========================================"
echo "Turtle Soup Mystery 数据存储初始化"
echo "========================================"

command -v npm >/dev/null 2>&1 || {
  echo "[ERROR] 未找到 npm，请先安装 Node.js 22+"
  exit 1
}

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "[INFO] 正在安装根依赖..."
  (cd "$ROOT_DIR" && npm install)
fi

echo "[INFO] 初始化运行时数据文件..."
(cd "$ROOT_DIR" && npm run init:data)

echo "[INFO] 完成。运行时状态文件位于 backend/data/runtime/app-state.json"
