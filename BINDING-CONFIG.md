# Claude Code 飞书集成配置

## 当前状态
- 飞书机器人已成功绑定到 Claude CLI
- 消息流向：飞书 → Claude CLI → 响应返回飞书
- 使用命令：`claude --print`

## 验证信息
从日志中可以看到：
- `[CLAUDE] 退出码: 0` - Claude CLI 成功执行
- `🤖 [CLAUDE] 我是飞书聊天助手...` - Claude 返回了响应
- `[SEND] ✅ 成功` - 响应已成功发送回飞书

## 工作流程
1. 飞书消息到达 → websocket-bridge.js 接收
2. 构建提示语 → buildPrompt() 函数处理
3. 调用Claude CLI → spawn('claude', ['--print'])
4. 发送提示到Claude → claude.stdin.write(prompt)
5. 获取Claude响应 → claude.stdout.on('data')
6. 发送响应回飞书 → sendMessage(chatId, reply)

## 配置详情
- App ID: cli_a91b8b28d1f8dbc4 (无极)
- 监听事件: im.message.receive_v1
- Claude CLI参数: --print
- 上下文管理: 启用，最多保留100轮对话