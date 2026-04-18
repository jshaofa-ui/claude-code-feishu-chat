#!/usr/bin/env node

/**
 * Claude Code 飞书事件处理器 - 轮询方式
 * 使用轮询方式获取飞书消息，通过Claude Code处理并回复
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置
const CHAT_IDS = [
  'oc_46c41a301af3569cc149d190d37c0060',  // 您的私聊窗口ID
];
const POLL_INTERVAL = 3000; // 3秒轮询一次
const PROCESSED_MESSAGES_FILE = path.join(__dirname, 'processed_poll_messages.json');

let processedMessages = new Set();

// 尝试读取已处理的消息记录
try {
  if (fs.existsSync(PROCESSED_MESSAGES_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROCESSED_MESSAGES_FILE, 'utf8'));
    processedMessages = new Set(data);
  }
} catch (e) {
  console.log('未能读取已处理消息记录，将从空记录开始');
}

// 存储已处理消息的函数
function saveProcessedMessages() {
  try {
    fs.writeFileSync(PROCESSED_MESSAGES_FILE, JSON.stringify([...processedMessages]));
  } catch (e) {
    console.error('保存已处理消息记录失败:', e.message);
  }
}

// 调用Claude Code处理消息
function processWithClaude(text) {
  return new Promise((resolve) => {
    const claude = spawn('claude', ['--print'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    // 向Claude发送输入
    claude.stdin.write(`${text}\n`);
    claude.stdin.end();

    // 收集Claude的输出
    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    // 当Claude处理完成时返回结果
    claude.on('close', (code) => {
      resolve(output.trim());
    });
  });
}

// 发送消息到飞书
function sendMessageToFeishu(chatId, content) {
  return new Promise((resolve, reject) => {
    // 转义特殊字符
    const escapedContent = content
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .substring(0, 1000); // 限制长度

    const command = `lark-cli im +messages-send --chat-id "${chatId}" --text "${escapedContent}" --as bot`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`发送消息错误:`, error.message);
        // 不返回reject，因为这可能是权限问题，不应该影响后续消息处理
        resolve("无法发送回复：权限不足");
      } else {
        console.log('消息发送成功');
        resolve(stdout);
      }
    });
  });
}

// 获取指定聊天的消息
function getChatMessages(chatId) {
  return new Promise((resolve) => {
    const command = `lark-cli im +chat-messages-list --chat-id "${chatId}" --as bot --page-size 20 2>&1`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`获取消息错误:`, error.message);
        resolve([]);
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const messages = data.data?.messages || [];

        // 只处理主消息（不处理话题回复）
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
        console.error(`解析消息失败:`, e.message);
        resolve([]);
      }
    });
  });
}

// 处理接收到的消息
async function handleMessage(msg) {
  if (!msg.message_id) return;
  if (processedMessages.has(msg.message_id)) return;

  // 标记为已处理
  processedMessages.add(msg.message_id);
  saveProcessedMessages();

  // 获取消息内容
  let content = msg.content;
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    content = parsed.text || content;
  } catch (e) {
    // 如果解析失败，使用原始内容
  }

  // 确保是文本消息且不为空
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return;
  }

  // 跳过机器人自己的消息
  if (msg.sender?.sender_type === 'app' || msg.sender?.sender_id?.app_id) {
    return;
  }

  const chatId = msg.chat_id;
  console.log(`\n🎯 收到新消息: ${content}`);

  try {
    // 使用Claude Code处理消息
    console.log('🧠 正在使用Claude Code处理...');
    const response = await processWithClaude(content);

    if (response && response.trim()) {
      console.log('📤 准备发送回复到飞书...');
      await sendMessageToFeishu(chatId, response);
      console.log('✅ 回复已发送或已处理权限问题');
    } else {
      console.log('⚠️ Claude未产生有效回复');
    }
  } catch (error) {
    console.error('❌ 处理消息时出错:', error);
  }
}

// 主轮询循环
async function pollLoop() {
  while (true) {
    try {
      // 轮询所有目标聊天
      for (const chatId of CHAT_IDS) {
        const msgs = await getChatMessages(chatId);
        for (const msg of msgs) {
          await handleMessage(msg);
        }
      }
    } catch (e) {
      console.error('❌ 轮询过程中出错:', e.message);
    }

    // 等待下一个轮询周期
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

// 主函数
async function main() {
  console.log('🚀 启动 Claude Code 飞书轮询监听器');
  console.log('📝 监听聊天窗口:', CHAT_IDS);
  console.log('⏱️  轮询间隔:', POLL_INTERVAL, 'ms');
  console.log('');

  console.log('🔄 开始轮询...');
  await pollLoop();
}

// 启动主程序
main().catch(console.error);

// 处理程序终止信号
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭 Claude Code 飞书集成...');
  saveProcessedMessages();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 正在关闭 Claude Code 飞书集成...');
  saveProcessedMessages();
  process.exit(0);
});