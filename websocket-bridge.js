/**
 * Claude Code 飞书事件处理器 - 卡接式卡片与审批功能
 * 使用 lark-cli event +subscribe 监听飞书事件，包括卡片按钮点击
 * 所有回复都在主聊天窗口，支持上下文关联
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const processedMessages = new Set();
const MESSAGE_EXPIRE_TIME = 5 * 60 * 1000; // 5 分钟过期
const MAX_CONTEXT_LENGTH = 100;

// 聊天上下文（按 chatId 分组）
const chatContexts = new Map();

// 清理过期消息
setInterval(() => {
  const now = Date.now();
  for (const msgId of processedMessages) {
    // 简单处理：定期清空，防止内存泄漏
  }
  if (processedMessages.size > 1000) {
    processedMessages.clear();
  }
}, 60000);

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
 * 发送消息到聊天
 */
function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .substring(0, 500);

    const cmd = `lark-cli im +messages-send --chat-id "${chatId}" --text "${escapedText}" --as bot`;

    console.log(`[SEND] ${chatId}: ${escapedText.substring(0, 50)}...`);
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`[SEND] ❌ 错误：${err.message}`);
        reject(err);
      } else {
        console.log(`[SEND] ✅ 成功`);
        resolve(stdout);
      }
    });
  });
}

/**
 * 发送审批卡片到聊天
 */
function sendApprovalCard(chatId, title, content, approvalId) {
  return new Promise((resolve, reject) => {
    const cardJson = {
      "config": {
        "wide_screen_mode": true,
        "enable_forward": true
      },
      "elements": [
        {
          "tag": "action",
          "actions": [
            {
              "tag": "button",
              "text": {
                "tag": "plain_text",
                "content": "批准"
              },
              "type": "primary",
              "value": {
                "action": "approve_request",
                "approval_id": approvalId,
                "chat_id": chatId  // 确保chat_id包含在action value中
              }
            },
            {
              "tag": "button",
              "text": {
                "tag": "plain_text",
                "content": "拒绝"
              },
              "type": "danger",
              "value": {
                "action": "reject_request",
                "approval_id": approvalId,
                "chat_id": chatId  // 确保chat_id包含在action value中
              }
            },
            {
              "tag": "button",
              "text": {
                "tag": "plain_text",
                "content": "查看详情"
              },
              "type": "default",
              "value": {
                "action": "view_details",
                "approval_id": approvalId,
                "chat_id": chatId  // 确保chat_id包含在action value中
              }
            }
          ]
        }
      ],
      "header": {
        "title": {
          "tag": "plain_text",
          "content": title
        },
        "template": "blue"
      },
      "modules": [
        {
          "tag": "section",
          "text": {
            "tag": "lark_md",
            "content": content
          }
        }
      ]
    };

    const cmd = `lark-cli im +messages-send --chat-id "${chatId}" --msg-type interactive --content '${JSON.stringify(cardJson)}' --as bot`;

    console.log(`[CARD] ${chatId}: 发送审批卡片 ${title}`);
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`[CARD] ❌ 错误：${err.message}`);
        reject(err);
      } else {
        console.log(`[CARD] ✅ 成功`);
        resolve(stdout);
      }
    });
  });
}

/**
 * 调用 Claude Code
 */
function callClaude(chatId, text) {
  return new Promise((resolve) => {
    const prompt = buildPrompt(chatId, text);

    const claude = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let reply = '';
    claude.stdout.on('data', d => { reply += d.toString(); });
    claude.stderr.on('data', d => { console.error(`[CLAUDE stderr] ${d.toString()}`); });

    // 发送输入到Claude
    claude.stdin.write(prompt);
    claude.stdin.end();

    claude.on('close', (code) => {
      console.log(`[CLAUDE] 退出码: ${code}`);
      reply = reply.trim()
        .replace(/\x1b\[[0-9;]*m/g, '')
        .substring(0, 500);
      resolve(reply);
    });

    claude.on('error', (err) => {
      console.error(`[CLAUDE] 启动失败: ${err.message}`);
      resolve('');
    });
  });
}

/**
 * 处理审批按钮点击
 */
async function handleApprovalAction(actionData) {
  const { action, approval_id, chat_id } = actionData;
  console.log(`[APPROVAL] 处理审批动作: ${action}, ID: ${approval_id}, Chat: ${chat_id}`);

  let response = '';
  switch (action) {
    case 'approve_request':
      response = `✅ 审批已批准 (ID: ${approval_id})`;
      console.log(`[APPROVAL] 审批已批准: ${approval_id}`);
      break;
    case 'reject_request':
      response = `❌ 审批已拒绝 (ID: ${approval_id})`;
      console.log(`[APPROVAL] 审批已拒绝: ${approval_id}`);
      break;
    case 'view_details':
      response = `📋 审批详情 (ID: ${approval_id})`;
      console.log(`[APPROVAL] 查看详情: ${approval_id}`);
      break;
    default:
      response = `❓ 未知的审批动作: ${action}`;
  }

  // 发送反馈到聊天
  try {
    // 确保chat_id存在
    if (!chat_id) {
      console.error(`[FEEDBACK] 无效的聊天ID: ${chat_id}`);
      return;
    }

    await sendMessage(chat_id, response);
    console.log(`[FEEDBACK] 发送审批反馈到: ${chat_id}`);
  } catch (e) {
    console.error(`[FEEDBACK] 发送审批反馈失败: ${e.message}`);
    // 尝试发送一个简化的消息
    try {
      const fallbackMessage = `处理了审批请求，ID: ${approval_id}`;
      await sendMessage(chat_id, fallbackMessage);
      console.log(`[FALLBACK] 使用备用消息发送到: ${chat_id}`);
    } catch (fallbackErr) {
      console.error(`[FALLBACK] 备用发送也失败: ${fallbackErr.message}`);
    }
  }
}

/**
 * 处理飞书事件
 */
async function handleFeishuEvent(eventData) {
  try {
    const event = JSON.parse(eventData);

    // 处理不同类型的事件
    if (event.header?.event_type === 'im.message.receive_v1') {
      // 处理消息接收事件
      const message = event.event?.message;
      if (!message || !message.message_id) return;

      const messageId = message.message_id;

      // 去重
      if (processedMessages.has(messageId)) return;
      processedMessages.add(messageId);

      const chatId = message.chat_id;
      const senderType = message.sender?.sender_type;
      const senderId = message.sender?.sender_id?.open_id || message.sender?.id;

      // 跳过机器人消息
      if (senderType === 'app') return;

      // 解析消息内容
      let text = '';
      try {
        const content = typeof message.content === 'string'
          ? JSON.parse(message.content)
          : message.content;
        text = content?.text || '';
      } catch (e) {
        text = message.content || '';
      }

      if (!text || text.trim().length === 0) return;

      console.log(`\n📥 [MSG] ${chatId} | ${senderId}: ${text.substring(0, 80)}`);

      // 添加到上下文
      addToContext(chatId, 'user', text);

      // 检查是否是创建审批卡片的指令
      if (text.toLowerCase().includes('审批') || text.includes('card') || text.includes('按钮')) {
        // 发送一个示例审批卡片
        await sendApprovalCard(
          chatId,
          "审批请求",
          "**申请人**: " + (senderId || "用户") + "\n**申请类型**: 示例审批\n**内容**: " + text,
          Date.now().toString()
        );
        console.log(`[CARD] 已发送审批卡片到: ${chatId}`);
        return;
      }

      // 调用 Claude Code
      const reply = await callClaude(chatId, text);

      if (reply) {
        console.log(`🤖 [CLAUDE] ${reply.substring(0, 100)}`);
        try {
          await sendMessage(chatId, reply);
          console.log(`✅ [OK] 回复已发送`);

          // 添加回复到上下文
          addToContext(chatId, 'assistant', reply);
        } catch (e) {
          console.error(`❌ [ERR] 发送失败：${e.message}`);
        }
      }
    }
    else if (event.header?.event_type === 'card.action.trigger') {
      // 处理卡片按钮点击事件
      console.log(`\n🔘 [CARD ACTION] 卡片按钮点击事件`);

      const actionValue = event.event?.action?.value;
      const openChatId = event.event?.context?.open_chat_id;  // 从context获取聊天ID

      if (actionValue) {
        // 从action value中获取参数，并从上下文获取聊天ID
        const action = actionValue.action || actionValue.action_type;
        const approvalId = actionValue.approval_id || Date.now().toString(); // 使用时间戳作为默认ID
        const chatId = actionValue.chat_id || openChatId; // 优先使用action中的chat_id，否则使用context中的open_chat_id

        console.log(`[CARD INFO] 从事件中获取到 - ChatID: ${chatId}, Action: ${action}, Approval ID: ${approvalId}`);

        if (!chatId) {
          console.error(`[CARD ERROR] 仍然无法获取聊天ID，事件数据: ${JSON.stringify(event)}`);
          return;
        }

        // 构造统一的actionData对象
        const unifiedActionData = {
          action: action,
          approval_id: approvalId,
          chat_id: chatId
        };

        await handleApprovalAction(unifiedActionData);
      } else {
        console.log(`[CARD ERROR] 未找到action value: ${JSON.stringify(event)}`);
      }
    }

  } catch (e) {
    console.error(`❌ [EVENT] 解析失败：${e.message}`);
  }
}

/**
 * 启动长连接监听
 */
function startEventListener() {
  console.log('='.repeat(50));
  console.log('Claude Code 飞书机器人 - 长连接模式（支持交互式卡片）');
  console.log('='.repeat(50));
  console.log(`[CMD] claude --print`);
  console.log(`[MODE] WebSocket 长连接`);
  console.log(`[FEATURES] 消息处理 + 交互式卡片 + 审批功能`);
  console.log(`[CONTEXT] 最多保留 ${MAX_CONTEXT_LENGTH} 轮对话`);
  console.log('[READY] 开始监听飞书事件...\n');

  // 使用 lark-cli event +subscribe 建立长连接，明确指定监听卡片事件
  const eventProc = spawn('lark-cli', ['event', '+subscribe', '--as', 'bot', '--force', '--event-types', 'im.message.receive_v1,card.action.trigger'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  eventProc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        handleFeishuEvent(line);
      } catch (e) {
        // 忽略非 JSON 行（如连接状态消息）
      }
    }
  });

  eventProc.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('Connected') && !msg.includes('Waiting')) {
      console.error(`[EVENT stderr] ${msg}`);
    } else if (msg) {
      console.log(`[EVENT] ${msg}`);
    }
  });

  eventProc.on('close', (code) => {
    console.log(`[EVENT] 连接关闭，退出码: ${code}`);
    console.log('[EVENT] 5 秒后重连...');
    setTimeout(startEventListener, 5000);
  });

  eventProc.on('error', (err) => {
    console.error(`[EVENT] 启动失败: ${err.message}`);
  });
}

startEventListener();

process.on('SIGINT', () => {
  console.log('\n[EXIT] 收到退出信号，正在退出...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\n[EXIT] 收到终止信号，正在退出...');
  process.exit(0);
});