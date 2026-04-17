/**
 * Claude Code 飞书机器人 - WebSocket 长连接版
 * 参考 claw-lark monitor.js 实现
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 加载配置
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// 加载模块
const { startWebSocket, stopWebSocket, sendCard } = require('./webhook');
const { startWebhook, stopWebhook } = require('./webhook-server');
const { createApproval, waitForApproval } = require('./approval');
const { buildApprovalCard, buildResolvedCard, buildTestCard } = require('./card');

// 上下文管理（按 chatId 分组）
const chatContexts = new Map();
const MAX_CONTEXT_LENGTH = 50;

// 已处理消息去重
const processedMessages = new Set();

// 审批计数器
let approvalCounter = 0;

/**
 * 获取聊天上下文
 */
function getChatContext(chatId) {
  if (!chatContexts.has(chatId)) {
    chatContexts.set(chatId, []);
  }
  return chatContexts.get(chatId);
}

/**
 * 添加消息到上下文
 */
function addToContext(chatId, role, text) {
  const context = getChatContext(chatId);
  context.push({ role, text, time: Date.now() });

  while (context.length > MAX_CONTEXT_LENGTH * 2) {
    context.shift();
  }
}

/**
 * 构建带上下文的 prompt
 */
function buildPrompt(chatId, newText) {
  const context = getChatContext(chatId);

  let prompt = '你是一个飞书聊天助手，请简洁回复（200 字内）。\n\n';

  if (context.length > 0) {
    prompt += '对话历史：\n';
    for (const msg of context) {
      const role = msg.role === 'user' ? '用户' : '助手';
      prompt += `${role}: ${msg.text.substring(0, 100)}\n`;
    }
    prompt += '\n';
  }

  prompt += `用户：${newText}\n助手：`;

  return prompt;
}

/**
 * 发送文本消息（使用 lark-cli）
 */
function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .substring(0, 4000);

    const cmd = `lark-cli im +messages-send --chat-id "${chatId}" --text "${escapedText}" --as bot`;

    console.log(`[SEND] ${chatId}: ${escapedText.substring(0, 50)}...`);
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`[SEND] 错误: ${err.message}`);
        reject(err);
      } else {
        console.log(`[SEND] 成功`);
        resolve(stdout);
      }
    });
  });
}

/**
 * 发送审批卡片
 */
async function sendApprovalCard(chatId, command, description, approvalId) {
  const cardJson = buildApprovalCard(command, description, approvalId);
  return sendCard(chatId, cardJson);
}

/**
 * 调用 Claude
 */
function callClaude(chatId, text) {
  return new Promise((resolve) => {
    const claude = spawn(config.claude.command, config.claude.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const prompt = buildPrompt(chatId, text);
    claude.stdin.write(prompt);
    claude.stdin.end();

    let reply = '';
    claude.stdout.on('data', d => { reply += d.toString(); });

    claude.on('close', () => {
      reply = reply.trim().substring(0, 4000);
      resolve(reply);
    });
  });
}

/**
 * 解析飞书消息内容
 */
function parseMessageContent(message) {
  const content = message.content;
  const messageType = message.message_type;

  try {
    const parsed = JSON.parse(content);

    if (messageType === 'text') {
      return parsed.text || '';
    }

    if (messageType === 'post') {
      // 富文本消息
      if (Array.isArray(parsed.content)) {
        return parsed.content
          .flat()
          .map(item => {
            if (item.tag === 'text') return item.text;
            if (item.tag === 'at') return item.user_name || `@${item.user_id}`;
            return '';
          })
          .join('');
      }
      return parsed.title || '';
    }

    return `[${messageType} message]`;
  } catch (e) {
    return content || '';
  }
}

/**
 * 处理消息事件（WebSocket 回调）
 */
async function handleMessageEvent(data) {
  const event = data.event || data;
  const message = event.message;

  if (!message) {
    console.log('[MSG] 无消息内容');
    return;
  }

  const messageId = message.message_id;
  const chatId = message.chat_id;
  const chatType = message.chat_type;

  // 去重
  if (processedMessages.has(messageId)) {
    console.log(`[MSG] 跳过重复消息: ${messageId}`);
    return;
  }
  processedMessages.add(messageId);

  // 跳过机器人自己的消息
  const sender = event.sender || {};
  const senderType = sender.sender_type;

  if (senderType === 'app') {
    console.log(`[MSG] 跳过机器人消息`);
    return;
  }

  // 解析消息内容
  const text = parseMessageContent(message);

  if (!text || text.trim().length === 0) {
    console.log(`[MSG] 跳过空消息`);
    return;
  }

  const senderId = sender.sender_id?.open_id || 'unknown';
  console.log(`\n[MSG] ${chatType} ${chatId} | ${senderId}: ${text.substring(0, 80)}`);

  // 添加到上下文
  addToContext(chatId, 'user', text);

  // 检查是否需要审批
  const needsApproval = checkNeedsApproval(text);

  if (needsApproval) {
    // 发送审批卡片
    const approvalId = ++approvalCounter;
    const { approvalId: id, promise } = createApproval(text, '敏感操作需要确认');

    console.log(`[APPROVAL] 发送审批卡片 #${id}`);
    await sendApprovalCard(chatId, text, '敏感操作需要确认', id);

    // 等待审批结果
    const choice = await waitForApproval(id, 60000);

    if (choice === 'approve') {
      console.log(`[APPROVAL] ✅ 执行命令`);
      const reply = await callClaude(chatId, text);
      await sendMessage(chatId, `✅ 执行结果:\n${reply}`);
      addToContext(chatId, 'assistant', reply);
    } else {
      console.log(`[APPROVAL] ❌ 取消执行`);
      await sendMessage(chatId, '❌ 操作已取消');
    }
  } else {
    // 正常对话处理
    const reply = await callClaude(chatId, text);
    if (reply) {
      console.log(`[CLAUDE] ${reply.substring(0, 100)}`);
      await sendMessage(chatId, reply);
      addToContext(chatId, 'assistant', reply);
    }
  }

  // 清理过期去重记录
  cleanupProcessedMessages();
}

/**
 * 检查命令是否需要审批
 */
function checkNeedsApproval(text) {
  const dangerousPatterns = [
    /删除/i,
    /remove/i,
    /delete/i,
    /^rm/i,
    /卸载/i,
    /uninstall/i,
    /清空/i,
    /格式化/i,
    /format/i,
  ];

  return dangerousPatterns.some(p => p.test(text));
}

/**
 * 清理过期的消息去重记录
 */
function cleanupProcessedMessages() {
  // 保留最近 1000 条消息 ID
  if (processedMessages.size > 1000) {
    const toDelete = processedMessages.size - 1000;
    const iterator = processedMessages.values();
    for (let i = 0; i < toDelete; i++) {
      processedMessages.delete(iterator.next().value);
    }
    console.log(`[CLEANUP] 清理 ${toDelete} 条过期消息ID`);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(50));
  console.log('Claude Code 飞书机器人 - WebSocket + Webhook 版');
  console.log('='.repeat(50));
  console.log(`[CONFIG] App ID: ${config.feishu.appId}`);
  console.log(`[CONFIG] Domain: ${config.feishu.domain || 'feishu'}`);
  console.log(`[CMD] ${config.claude.command} ${config.claude.args.join(' ')}`);

  // 启动 HTTP Webhook 服务（用于卡片回调）
  const webhookPort = config.feishu.webhookPort || 3000;
  startWebhook(config, webhookPort);

  console.log('[READY] 启动 WebSocket 连接...\n');

  // 定义事件处理器
  const handlers = {
    onMessage: handleMessageEvent,
    onCardAction: null, // 卡片回调由 Webhook 处理
  };

  // 启动 WebSocket 长连接（用于消息接收）
  const success = await startWebSocket(config, handlers);

  if (!success) {
    console.error('[ERROR] WebSocket 连接失败');
    // WebSocket 失败时 Webhook 仍可工作
  }

  // 保持进程运行
  process.on('SIGINT', () => {
    console.log('\n[EXIT] 收到 SIGINT，停止服务...');
    stopWebSocket();
    stopWebhook();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[EXIT] 收到 SIGTERM，停止服务...');
    stopWebSocket();
    stopWebhook();
    process.exit(0);
  });

  console.log('[READY] 服务已启动，等待消息...');
}

main();