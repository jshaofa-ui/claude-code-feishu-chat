#!/bin/bash
# Claude Code 专用飞书 WebSocket 长连接集成启动脚本

cd "$(dirname "$0")"

echo "========================================"
echo "Claude Code 专用飞书 WebSocket 长连接集成"
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

if ! command -v claude &> /dev/null; then
    echo "❌ 错误：claude 未安装"
    exit 1
fi

# 启动 WebSocket 长连接服务
echo "🔗 启动 Claude Code 专用飞书 WebSocket 长连接..."
node websocket-bridge.js