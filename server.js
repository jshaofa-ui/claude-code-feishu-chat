/**
 * Claude Code 飞书事件处理器 - 无限上下文版
 * 所有回复都在主聊天窗口，支持上下文关联，带 emoji 反应
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const processedMessages = new Set();
const POLL_INTERVAL = 3000;
const MAX_CONTEXT_LENGTH = 100; // 最多保留 100 条历史消息（近似无限）

// 聊天上下文（按 chatId 分组）
const chatContexts = new Map();

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
  
  // 限制上下文长度
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
  
  // 添加历史对话
  if (context.length > 0) {
    prompt += '对话历史：\n';
    for (const msg of context) {
      const role = msg.role === 'user' ? '用户' : '助手';
      prompt += `${role}: ${msg.text.substring(0, 100)}\n`;
    }
    prompt += '\n';
  }
  
  // 添加当前消息
  prompt += `用户：${newText}\n助手：`;
  
  return prompt;
}

// 存储 emoji 反应 ID（messageId -> reactionId）
const emojiReactions = new Map();

/**
 * 添加 emoji 反应（表示正在处理）
 */
function addEmojiReaction(messageId) {
  const paramsData = JSON.stringify({message_id: messageId});
  const emojiData = JSON.stringify({reaction_type: {emoji_type: "ROSE"}});
  console.log(`[EMOJI] 🌹 添加反应：${messageId}`);
  exec(`lark-cli im reactions create --params '${paramsData}' --data '${emojiData}' --as bot`, (err, stdout, stderr) => {
    if (err) {
      console.error(`[EMOJI] ❌ 添加失败：${err.message}`);
    } else {
      try {
        const result = JSON.parse(stdout);
        const reactionId = result.data?.reaction_id;
        if (reactionId) {
          emojiReactions.set(messageId, reactionId);
          console.log(`[EMOJI] ✅ 添加成功 (reaction_id: ${reactionId.substring(0, 20)}...)`);
        }
      } catch (e) {
        console.error(`[EMOJI] 解析失败：${e.message}`);
      }
    }
  });
}

/**
 * 删除 emoji 反应（表示处理完成）
 */
function removeEmojiReaction(messageId) {
  const reactionId = emojiReactions.get(messageId);
  if (!reactionId) {
    console.log(`[EMOJI] ⚠️ 无反应可删除：${messageId}`);
    return;
  }
  
  const paramsData = JSON.stringify({message_id: messageId, reaction_id: reactionId});
  console.log(`[EMOJI] 🌹 删除反应：${messageId} (reaction_id: ${reactionId.substring(0, 20)}...)`);
  exec(`lark-cli im reactions delete --params '${paramsData}' --as bot`, (err, stdout, stderr) => {
    if (err) {
      console.error(`[EMOJI] ❌ 删除失败：${err.message}`);
    } else {
      console.log(`[EMOJI] ✅ 删除成功`);
      emojiReactions.delete(messageId);
    }
  });
}

/**
 * 发送消息到主聊天（不创建话题）
 */
function sendMessage(chatId, text) {
  return new Promise((resolve, reject) => {
    // 转义特殊字符
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .substring(0, 500); // 限制长度（包含思考过程）
    
    const cmd = `lark-cli im +messages-send --chat-id "${chatId}" --text "${escapedText}" --as bot`;
    
    console.log(`[SEND] ${chatId}: ${escapedText.substring(0, 50)}...`);
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error(`[SEND] ❌ 错误：${err.message}`);
        console.error(`[SEND] stderr: ${stderr}`);
        reject(err);
      } else {
        console.log(`[SEND] ✅ 成功`);
        resolve(stdout);
      }
    });
  });
}

/**
 * 调用 Claude - 带上下文
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
      // 限制总长度
      reply = reply.trim().substring(0, 500);
      resolve(reply);
    });
  });
}

/**
 * 获取聊天消息（只处理主消息，忽略话题回复）
 */
function getMessages(chatId) {
  return new Promise((resolve) => {
    exec(`lark-cli im +chat-messages-list --chat-id "${chatId}" --as bot --page-size 20 2>&1`, (err, stdout) => {
      try {
        const data = JSON.parse(stdout);
        const messages = data.data?.messages || [];
        
        // 只处理主消息（不处理 thread_replies）
        const mainMsgs = [];
        const seenIds = new Set();
        
        for (const msg of messages) {
          if (!seenIds.has(msg.message_id)) {
            msg.chat_id = chatId;
            mainMsgs.push(msg);
            seenIds.add(msg.message_id);
          }
        }
        
        console.log(`🔄 [POLL] ${chatId}: ${mainMsgs.length} 条消息`);
        resolve(mainMsgs);
      } catch (e) {
        console.error(`❌ [POLL] 解析失败：${e.message}`);
        resolve([]);
      }
    });
  });
}

/**
 * 处理消息
 */
async function handleMsg(msg) {
  if (!msg.message_id) return;
  if (processedMessages.has(msg.message_id)) return;
  
  const chatId = msg.chat_id;
  
  // 跳过机器人自己的消息
  if (msg.sender?.sender_type === 'app' || msg.sender?.id?.startsWith('cli_')) {
    processedMessages.add(msg.message_id);
    return;
  }
  
  // 解析内容
  let text = msg.content;
  try {
    const c = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
    text = c?.text || '';
  } catch (e) {}
  
  if (!text || text.trim().length === 0) {
    processedMessages.add(msg.message_id);
    return;
  }
  
  // 检查时间（10 分钟内）
  if (msg.create_time) {
    const msgTime = new Date(msg.create_time.replace(' ', 'T')).getTime();
    if ((Date.now() - msgTime) > 10 * 60 * 1000) {
      processedMessages.add(msg.message_id);
      return;
    }
  }
  
  // 立即标记为已处理
  processedMessages.add(msg.message_id);
  
  const sender = msg.sender?.id || 'unknown';
  console.log(`\n📥 [MSG] ${chatId} | ${sender}: ${text.substring(0, 80)}`);
  
  // 先给用户消息添加 emoji 反应（表示已收到，正在处理）
  addEmojiReaction(msg.message_id);
  
  // 添加到上下文
  addToContext(chatId, 'user', text);
  
  const reply = await callClaude(chatId, text);
  if (reply) {
    console.log(`🤖 [CLAUDE] ${reply.substring(0, 100)}`);
    try {
      // 所有回复都发送到主聊天（不创建话题）
      await sendMessage(chatId, reply);
      console.log(`✅ [OK] 回复已发送 (主聊天)`);
      
      // 处理完成，删除 emoji 反应
      removeEmojiReaction(msg.message_id);
      
      // 将回复添加到上下文
      addToContext(chatId, 'assistant', reply);
    } catch (e) {
      console.error(`❌ [ERR] 发送失败：${e.message}`);
    }
  }
}

/**
 * 主循环
 */
async function main() {
  console.log('='.repeat(50));
  console.log('Claude Code 飞书机器人 - 无限上下文版');
  console.log('='.repeat(50));
  console.log(`[CMD] ${config.claude.command} ${config.claude.args.join(' ')}`);
  console.log(`[POLL] ${POLL_INTERVAL}ms`);
  console.log(`[CONTEXT] 最多保留 ${MAX_CONTEXT_LENGTH} 轮对话（近似无限）`);
  console.log('[READY] 开始轮询...\n');
  
  // 预定义要监听的聊天
  const targetChats = [
    'oc_46c41a301af3569cc149d190d37c0060',  // 董事长私聊
    'oc_dd65a2afd81096384d16588ae9aff282',  // 电子斗蛐蛐群
  ];
  
  while (true) {
    try {
      // 轮询所有目标聊天
      for (const chatId of targetChats) {
        const msgs = await getMessages(chatId);
        for (const msg of msgs) {
          await handleMsg(msg);
        }
      }
    } catch (e) {
      console.error(`❌ [ERR] ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

main();
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
