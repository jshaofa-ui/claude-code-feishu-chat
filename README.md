# Claude Code Feishu 专用事件监听器

## 概述
已成功设置 Claude Code 与飞书的事件监听集成，实现了：
- 通过 lark-cli 建立长连接监听飞书事件
- 接收飞书消息并传递给 Claude Code CLI 处理
- 将 Claude Code CLI 的回复发送回飞书

## 核心功能
✓ 从飞书聊天接收消息  
✓ 将消息传递给 Claude Code CLI 处理  
✓ 将 Claude Code CLI 响应返回到飞书  
✓ 事件监听持续运行  
✓ 避免重复处理消息  
✓ 自动重连机制  
✓ 上下文感知对话  
✓ 与 Claude Code CLI 完全绑定  

## 审批功能扩展
我们还提供了交互式卡片功能，可通过按钮实现审批流程：
- 使用 `send-approval-card.sh` 脚本发送带按钮的审批卡片
- 卡片包含"批准"、"拒绝"和"查看详情"按钮
- 结合 lark-approval 技能处理审批任务

## Claude Code CLI 绑定
- 直接调用 `claude --print` 命令
- 消息自动构建为合适的提示语格式
- Claude Code CLI 的响应直接返回给用户
- 保持完整的上下文连续性

## 核心文件
- `websocket-bridge.js` - 事件监听主程序 (使用lark-cli事件订阅)
- `ws-daemon.sh` - 守护进程管理脚本
- `ws-start.sh` - 手动启动脚本
- `send-approval-card.sh` - 发送审批卡片脚本
- `APPROVAL_CARD_GUIDE.md` - 审批卡片实现指南
- `BINDING-CONFIG.md` - Claude Code CLI 绑定配置

## 服务控制
启动服务：
```bash
~/.claude/claude-code-feishu-chat/ws-daemon.sh start
```

查看状态：
```bash
~/.claude/claude-code-feishu-chat/ws-daemon.sh status
```

停止服务：
```bash
~/.claude/claude-code-feishu-chat/ws-daemon.sh stop
```

重启服务：
```bash
~/.claude/claude-code-feishu-chat/ws-daemon.sh restart
```

## 发送审批卡片
要发送审批卡片，请使用：
```bash
~/.claude/claude-code-feishu-chat/send-approval-card.sh <chat-id> "审批标题" "审批内容"
```

## 重要说明
当前实现已使用正确的 App ID (cli_a91b8b28d1f8dbc4) 进行配置。
Claude Code 飞书机器人已完全绑定到 Claude Code CLI，
所有接收到的消息都会通过 `claude --print` 命令处理。

## 功能状态
- 事件监听：✅ 正常工作
- Claude Code CLI 集成：✅ 正常工作
- 消息处理：✅ 正常工作
- 消息回复：✅ 正常工作（受限于飞书API权限）
- 审批卡片：✅ 支持交互式卡片发送
- Claude CLI 绑定：✅ 完全集成

## 工作原理
- 监听消息事件：im.message.receive_v1
- 使用 Claude Code CLI --print 模式处理
- 支持上下文感知对话
- 事件监听持续运行
- 避免重复处理消息
- 自动重连机制