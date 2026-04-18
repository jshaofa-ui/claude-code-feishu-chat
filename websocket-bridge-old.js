#!/usr/bin/env node

/**
 * Claude Code 专用飞书 WebSocket 长连接集成
 * 直接建立 WebSocket 长连接监听飞书消息
 */

const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHAT_ID = 'oc_46c41a301af3569cc149d190d37c0060'; // 您的私聊窗口ID
const PROCESSED_MESSAGES_FILE = path.join(__dirname, 'processed_ws_messages.json');

let processedMessages = new Set();
let ws = null;

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
function sendMessageToFeishu(content) {
  return new Promise((resolve, reject) => {
    // 转义特殊字符
    const escapedContent = content
      .replace(/"/g, '\\"')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
      .substring(0, 1000); // 限制长度

    const command = `lark-cli im +messages-send --chat-id "${CHAT_ID}" --text "${escapedContent}" --as bot`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`发送消息错误: ${error}`);
        reject(error);
      } else {
        console.log('消息发送成功');
        resolve(stdout);
      }
    });
  });
}

// 处理接收到的消息
async function handleMessage(event) {
  if (!event.event?.message?.message_id) return;

  const messageId = event.event.message.message_id;

  if (processedMessages.has(messageId)) {
    console.log('消息已处理，跳过');
    return;
  }

  // 标记为已处理
  processedMessages.add(messageId);
  saveProcessedMessages();

  // 获取消息内容
  let content = event.event.message.content;
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
  if (event.event?.sender?.sender_type === 'app' || event.event?.sender?.sender_id?.app_id) {
    console.log('跳过机器人消息');
    return;
  }

  console.log(`\n🎯 收到新消息: ${content}`);

  try {
    // 使用Claude Code处理消息
    console.log('🧠 正在使用Claude Code处理...');
    const response = await processWithClaude(content);

    if (response && response.trim()) {
      console.log('📤 准备发送回复到飞书...');
      await sendMessageToFeishu(response);
      console.log('✅ 回复已发送');
    } else {
      console.log('⚠️ Claude未产生有效回复');
    }
  } catch (error) {
    console.error('❌ 处理消息时出错:', error);
  }
}

// 连接到飞书 WebSocket 服务
function connectWebSocket() {
  console.log('🔌 正在建立 WebSocket 长连接...');

  // 使用 lark-cli 获取 WebSocket 连接信息
  const child = spawn('lark-cli', ['event', '+subscribe', '--event-types', 'im.message.receive_v1']);

  child.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line.includes('Connected') || line.includes('websocket')) {
      console.log(`🔗 ${line}`);
    }
  });

  child.stdout.on('data', async (data) => {
    const line = data.toString().trim();

    // 检查是否是JSON格式的事件
    if (line.startsWith('{')) {
      try {
        const event = JSON.parse(line);

        // 验证是否是消息接收事件
        if (event.header?.event_type === 'im.message.receive_v1') {
          console.log('\n📋 处理接收到的消息事件...');
          await handleMessage(event);
        }
      } catch (e) {
        // 非JSON行，可能是连接状态消息，忽略
        console.log(`📋 ${line}`);
      }
    }
  });

  child.on('close', (code) => {
    console.log(`\n❌ WebSocket 连接断开，代码: ${code}`);
    console.log('🔄 5秒后尝试重新连接...');
    setTimeout(connectWebSocket, 5000);
  });

  return child;
}

// 主函数
function main() {
  console.log('🚀 启动 Claude Code 专用飞书 WebSocket 集成');
  console.log('📝 监听私聊窗口:', CHAT_ID);
  console.log('');

  // 建立长连接
  connectWebSocket();

  // 处理程序终止信号
  process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭 Claude Code 飞书集成...');
    saveProcessedMessages();
    if (ws) ws.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 正在关闭 Claude Code 飞书集成...');
    saveProcessedMessages();
    if (ws) ws.close();
    process.exit(0);
  });
}

// 启动主程序
main();