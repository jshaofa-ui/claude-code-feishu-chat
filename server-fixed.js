/**
 * Claude Code 飞书事件处理器（修复版）
 * 监听飞书消息事件并触发 Claude Code 响应，然后发送回复
 */

const { Client } = require('@larksuiteoapi/node-sdk');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 加载配置
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// 导入回复发送器
const { sendFeishuReply } = require('./send-reply.js');

// 注：使用 lark-cli 作为事件源，无需直接配置 appId/appSecret
// lark-cli 已处理认证

// 事件处理状态
const processedMessages = new Set();
const MESSAGE_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// 清理旧消息 ID
setInterval(() => {
  if (processedMessages.size > 1000) {
    processedMessages.clear();
  }
}, MESSAGE_CACHE_TTL);

/**
 * 触发 Claude Code 处理消息并发送回复
 */
async function triggerClaudeCodeAndReply(messageId, chatId, text, senderId) {
  console.log(`[Trigger] 收到消息：${messageId} from ${senderId} in ${chatId}`);
  console.log(`[Trigger] 内容：${text}`);

  try {
    // 使用 ACP 模式启动 Claude Code
    const claude = spawn(config.claude.command, config.claude.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 构建提示词
    const prompt = `收到飞书消息：
- 发送者：${senderId}
- 聊天：${chatId}
- 内容：${text}

请处理此消息并生成回复。`;

    claude.stdin.write(prompt);
    claude.stdin.end();

    // 收集输出
    let output = '';
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      console.error(`[Claude stderr]: ${data}`);
    });

    return new Promise((resolve, reject) => {
      claude.on('close', async (code) => {
        console.log(`[Claude] 处理完成，退出码：${code}`);
        
        if (output) {
          console.log(`[Claude] 输出：${output.substring(0, 200)}...`);
          
          // 发送回复
          try {
            const replySuccess = await sendFeishuReply(messageId, output.trim(), true);
            if (replySuccess) {
              console.log('[Reply] 回复已成功发送!');
              resolve(true);
            } else {
              console.error('[Reply] 回复发送失败!');
              resolve(false);
            }
          } catch (replyError) {
            console.error('[Reply] 发送回复时发生错误:', replyError);
            resolve(false);
          }
        } else {
          console.log('[Claude] 无输出，不发送回复');
          resolve(false);
        }
      });

      claude.on('error', (error) => {
        console.error('[Trigger] Claude Code 启动失败:', error);
        reject(error);
      });
    });

  } catch (error) {
    console.error('[Trigger] 触发 Claude Code 失败:', error);
    return false;
  }
}

/**
 * 处理飞书消息事件
 */
async function handleReceiveMessage(data) {
  try {
    const { header, event } = data;
    const message = event?.message;

    if (!message) {
      console.log('[Event] 跳过：无消息内容');
      return;
    }

    const messageId = message.message_id;
    const chatId = message.chat_id;
    const senderId = message.sender_id;
    const content = JSON.parse(message.content || '{}');
    const text = content.text || content.content || '';

    // 去重检查
    if (processedMessages.has(messageId)) {
      console.log(`[Event] 跳过：已处理的消息 ${messageId}`);
      return;
    }
    processedMessages.add(messageId);

    // 忽略机器人自己的消息
    if (senderId?.startsWith('ou_') === false || senderId === 'bot') {
      console.log('[Event] 跳过：机器人消息');
      return;
    }

    // 只处理私聊和 @ 消息
    const isDm = chatId?.startsWith('oc_');
    const isMentioned = text.includes('@bot') || text.includes('@Claude');

    if (!isDm && !isMentioned) {
      console.log('[Event] 跳过：群聊未 @ 消息');
      return;
    }

    // 触发 Claude Code 并发送回复
    await triggerClaudeCodeAndReply(messageId, chatId, text, senderId);

  } catch (error) {
    console.error('[Event] 处理消息失败:', error);
  }
}

/**
 * 启动 WebSocket 监听
 */
function startWebSocketListener() {
  console.log('[WS] 启动 WebSocket 监听...');

  // 使用 lark-cli event +subscribe 作为事件源
  const larkEvent = spawn('lark-cli', [
    'event',
    '+subscribe',
    '--event-types',
    'im.message.receive_v1',
    '--as',
    'bot',
  ]);

  larkEvent.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          const event = JSON.parse(line);
          if (event.type === 'im.message.receive_v1') {
            handleReceiveMessage(event);
          }
        } catch (e) {
          // 跳过非 JSON 行
        }
      }
    }
  });

  larkEvent.stderr.on('data', (data) => {
    console.error(`[lark-cli stderr]: ${data}`);
  });

  larkEvent.on('close', (code) => {
    console.log(`[lark-cli] 退出，码：${code}，5 秒后重启...`);
    setTimeout(startWebSocketListener, 5000);
  });
}

// 主程序
console.log('='.repeat(50));
console.log('Claude Code 飞书事件处理器（修复版）启动');
console.log('='.repeat(50));
console.log(`[Config] 事件类型：${config.feishu.eventTypes.join(', ')}`);
console.log(`[Config] Claude 命令：${config.claude.command} ${config.claude.args.join(' ')}`);
console.log('');

// 启动监听
startWebSocketListener();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[Shutdown] 正在关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Shutdown] 收到终止信号...');
  process.exit(0);
});