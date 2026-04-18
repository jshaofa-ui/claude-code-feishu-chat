#!/bin/bash
# Claude Code 专用飞书 WebSocket 长连接集成 - 后台守护进程

PIDFILE="$HOME/.claude/claude-code-feishu-chat/claude-ws.pid"
LOGFILE="$HOME/.claude/claude-code-feishu-chat/claude-ws.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

start() {
    if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE") 2>/dev/null; then
        echo "⚠️  已在运行 (PID: $(cat $PIDFILE))"
        return 1
    fi

    echo "🔗 启动 Claude Code 专用飞书 WebSocket 长连接..."
    cd "$SCRIPT_DIR"
    nohup node websocket-bridge.js > "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    echo "✅ 已启动 (PID: $(cat $PIDFILE))"
    echo "📄 日志：$LOGFILE"
}

stop() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "🛑 停止 WebSocket 长连接服务 (PID: $PID)..."
            kill "$PID"
            rm -f "$PIDFILE"
            echo "✅ 已停止"
        else
            echo "⚠️  进程不存在，清理 PID 文件"
            rm -f "$PIDFILE"
        fi
    else
        echo "⚠️  未运行"
    fi
}

restart() {
    stop
    sleep 2
    start
}

status() {
    if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE") 2>/dev/null; then
        echo "✅ WebSocket 长连接运行中 (PID: $(cat $PIDFILE))"
        echo "📄 日志：$LOGFILE"
        echo ""
        echo "最近日志:"
        tail -20 "$LOGFILE"
    else
        echo "❌ WebSocket 长连接未运行"
    fi
}

case "${1:-status}" in
    start) start ;;
    stop) stop ;;
    restart) restart ;;
    status) status ;;
    *) echo "用法: $0 {start|stop|restart|status}" ;;
esac