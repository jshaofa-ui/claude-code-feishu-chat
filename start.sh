#!/bin/bash
# Claude Code 飞书事件处理器启动脚本

cd "$(dirname "$0")"

echo "========================================"
echo "Claude Code 飞书事件处理器"
echo "========================================"
echo ""

# 检查依赖
if ! command -v node &> /dev/null; then
    echo "❌ 错误：Node.js 未安装"
    exit 1
fi

if ! command -v lark-cli &> /dev/null; then
    echo "❌ 错误：lark-cli 未安装"
    exit 1
fi

# 检查配置
if [ ! -f "config.json" ]; then
    echo "❌ 错误：config.json 不存在"
    exit 1
fi

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

echo "✅ 启动事件处理器..."
echo ""

# 启动服务
node server.js
