/**
 * Claude Code 飞书回复发送器
 * 供 Claude Code 调用以发送飞书回复
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * 发送飞书回复
 * @param {string} messageId - 要回复的消息ID (om_xxx)
 * @param {string} replyText - 回复内容
 * @param {boolean} replyInThread - 是否在原消息线程中回复
 * @returns {Promise<boolean>} - 发送是否成功
 */
async function sendFeishuReply(messageId, replyText, replyInThread = true) {
  console.log(`[SendReply] 准备回复消息: ${messageId}`);
  console.log(`[SendReply] 回复内容: ${replyText.substring(0, 100)}...`);
  
  try {
    // 构建 lark-cli 命令参数
    const args = [
      'im', 
      '+messages-reply',
      '--message-id', messageId,
      '--text', replyText
    ];
    
    // 如果需要在线程中回复，添加 --reply-in-thread 参数
    if (replyInThread) {
      args.push('--reply-in-thread');
    }
    
    // 使用 bot 身份发送
    args.push('--as', 'bot');
    
    console.log(`[SendReply] 执行命令: lark-cli ${args.join(' ')}`);
    
    const larkCli = spawn('lark-cli', args);
    
    let stdout = '';
    let stderr = '';
    
    larkCli.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    larkCli.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    return new Promise((resolve, reject) => {
      larkCli.on('close', (code) => {
        console.log(`[SendReply] lark-cli 退出码: ${code}`);
        console.log(`[SendReply] stdout: ${stdout}`);
        if (stderr) {
          console.error(`[SendReply] stderr: ${stderr}`);
        }
        
        if (code === 0) {
          console.log('[SendReply] 回复发送成功!');
          resolve(true);
        } else {
          console.error('[SendReply] 回复发送失败!');
          reject(new Error(`lark-cli failed with code ${code}: ${stderr}`));
        }
      });
      
      larkCli.on('error', (error) => {
        console.error('[SendReply] lark-cli 启动失败:', error);
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('[SendReply] 发送回复时发生错误:', error);
    return false;
  }
}

// 如果作为独立脚本运行
if (require.main === module) {
  // 从命令行参数获取参数
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('用法: node send-reply.js <messageId> <replyText> [replyInThread]');
    process.exit(1);
  }
  
  const messageId = args[0];
  const replyText = args[1];
  const replyInThread = args[2] !== 'false';
  
  sendFeishuReply(messageId, replyText, replyInThread)
    .then(success => {
      if (success) {
        console.log('✅ 飞书回复发送成功!');
        process.exit(0);
      } else {
        console.error('❌ 飞书回复发送失败!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ 发送回复时发生错误:', error);
      process.exit(1);
    });
}

module.exports = { sendFeishuReply };