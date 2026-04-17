# Claude Code 飞书机器人 - 交互式卡片版

基于 WebSocket 长连接 + HTTP Webhook 的飞书机器人，支持交互式审批卡片。

## 一键配置

### 1. 复制配置文件
```bash
cp config.example.json config.json
```

### 2. 编辑配置（填入你的飞书应用密钥）
```json
{
  "feishu": {
    "enabled": true,
    "appId": "cli_xxx",           // 飞书 App ID
    "appSecret": "xxx",            // 飞书 App Secret（不要上传！）
    "domain": "feishu",            // feishu 或 lark
    "webhookPort": 3000            // Webhook 端口
  },
  "claude": {
    "command": "claude",
    "args": ["-p"]
  }
}
```

### 3. 安装依赖
```bash
npm install
```

### 4. 启动服务
```bash
node server-ws.js
```

## 飞书后台配置

### WebSocket（消息接收）
开发者后台 → 事件与回调 → 订阅方式 → **使用长连接接收事件/回调**

添加事件订阅：
- `im.message.receive_v1` - 接收消息

### Webhook（卡片回调）
开发者后台 → 事件与回调 → 回调配置 → 配置请求地址

```
http://你的公网地址:3000/feishu/card-callback
```

添加回调订阅：
- `card.action.trigger` - 卡片按钮点击

### 本地开发（无公网 IP）
使用 ngrok 创建公网隧道：
```bash
ngrok http 3000
```
将 ngrok 提供的 URL 配置到飞书回调地址。

## 功能说明

| 文件 | 功能 |
|------|------|
| `server-ws.js` | 主服务（WebSocket 消息 + Webhook 卡片回调）|
| `card.js` | 交互式卡片 JSON 模板 |
| `approval.js` | 异步审批状态管理（无限等待）|
| `webhook.js` | WebSocket 连接模块 |
| `webhook-server.js` | HTTP Webhook 服务 |

## 测试

发送包含"删除"关键词的消息会触发审批卡片：
```
删除 test.txt
```

点击「确认」或「取消」按钮，卡片实时更新显示操作结果。

## 安全提示

- `config.json` 包含敏感密钥，已在 `.gitignore` 中排除
- **不要将 config.json 上传到 GitHub**
- 使用 `config.example.json` 作为配置模板