#!/bin/bash
# Claude Code 飞书事件处理器停止脚本

cd "$(dirname "$0")"

echo "========================================"
echo "停止 Claude Code 飞书事件处理器"
echo "========================================"

# 终止进程
if [ -f feishu-event.pid ]; then
    PID=$(cat feishu-event.pid)
    if ps -p $PID > /dev/null; then
        echo "🛑 终止进程 PID: $PID"
        kill $PID
        sleep 2
        if ps -p $PID > /dev/null; then
            echo "⚠️  强制终止进程..."
            kill -9 $PID
        fi
    fi
    rm -f feishu-event.pid
fi

# 终止所有相关进程
pkill -f "server.js" 2>/dev/null || true
pkill -f "lark-cli.*event.*subscribe" 2>/dev/null || true

echo "✅ 服务已停止"