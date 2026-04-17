/**
 * 飞书卡片 Webhook 服务
 * Node SDK 的 WSClient 不支持 card 类型消息，需要单独的 HTTP Webhook
 */

const http = require('http');
const crypto = require('crypto');
const { resolveApproval } = require('./approval');
const { buildResolvedCard } = require('./card');

let webhookServer = null;

/**
 * 解密飞书加密事件
 */
function decryptEvent(encrypted, encryptKey) {
  if (!encryptKey) return encrypted;
  const key = crypto.createHash('sha256').update(encryptKey).digest();
  const encryptedBuffer = Buffer.from(encrypted, 'base64');
  const iv = encryptedBuffer.subarray(0, 16);
  const ciphertext = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * 处理卡片回调
 */
function handleCardCallback(body) {
  console.log('[WEBHOOK] 收到卡片回调:', JSON.stringify(body).substring(0, 500));

  const operator = body.operator || {};
  const action = body.action || {};
  const actionValue = action.value || {};

  const openId = operator.open_id || 'Unknown';
  const approvalId = actionValue.approval_id;
  const choice = actionValue.action;

  console.log(`[WEBHOOK] 操作者: ${openId}, 审批ID: ${approvalId}, 选择: ${choice}`);

  // 处理审批回调
  if (approvalId && choice) {
    resolveApproval(approvalId, choice);
    const resolvedCard = buildResolvedCard(choice, openId);
    return {
      toast: { type: 'success', content: '操作成功' },
      card: { type: 'raw', data: resolvedCard }
    };
  }

  // 处理测试回调
  if (actionValue.test) {
    return {
      toast: { type: 'success', content: '✅ Webhook 回调正常！' },
      card: {
        type: 'raw',
        data: {
          config: { wide_screen_mode: true },
          header: { title: { tag: 'plain_text', content: '✅ 测试成功' }, template: 'green' },
          elements: [{ tag: 'markdown', content: `✅ **回调成功！**\n\n操作者: ${openId}\n时间: ${new Date().toISOString()}` }]
        }
      }
    };
  }

  return { toast: { type: 'info', content: '收到回调' } };
}

/**
 * 启动 Webhook 服务
 */
function startWebhook(config, port = 3000) {
  const webhookPath = '/feishu/card-callback';

  webhookServer = http.createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return;
    }

    // 读取请求体
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        let body = Buffer.concat(chunks).toString('utf8');
        if (!body) {
          res.statusCode = 200;
          res.end('OK');
          return;
        }

        let data = JSON.parse(body);

        // 处理加密事件
        if (data.encrypt && config.feishu.encryptKey) {
          const decrypted = decryptEvent(data.encrypt, config.feishu.encryptKey);
          data = JSON.parse(decrypted);
        }

        // 处理 URL 验证
        if (data.type === 'url_verification') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ challenge: data.challenge }));
          console.log('[WEBHOOK] URL 验证成功');
          return;
        }

        // 验证 Token
        const token = data.header?.token || data.token;
        if (config.feishu.verificationToken && token !== config.feishu.verificationToken) {
          console.warn('[WEBHOOK] Token 验证失败');
          res.statusCode = 401;
          res.end('Unauthorized');
          return;
        }

        // 处理卡片回调
        const eventType = data.header?.event_type || data.event_type;
        if (eventType === 'card.action.trigger') {
          const event = data.event || data;
          const response = handleCardCallback(event);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(response));
          console.log('[WEBHOOK] 返回卡片响应:', JSON.stringify(response));
          return;
        }

        // 处理消息事件
        if (eventType === 'im.message.receive_v1') {
          // 这里可以转发给 WebSocket 处理器或直接处理
          console.log('[WEBHOOK] 收到消息事件');
          res.statusCode = 200;
          res.end('OK');
          return;
        }

        res.statusCode = 200;
        res.end('OK');
      } catch (error) {
        console.error('[WEBHOOK] 处理错误:', error.message);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  });

  webhookServer.listen(port, () => {
    console.log(`[WEBHOOK] ✅ 服务启动: http://localhost:${port}${webhookPath}`);
    console.log('[WEBHOOK] 请在飞书后台配置此地址为卡片回调 URL');
  });

  webhookServer.on('error', (err) => {
    console.error('[WEBHOOK] 服务错误:', err.message);
  });

  return webhookServer;
}

/**
 * 停止 Webhook 服务
 */
function stopWebhook() {
  if (webhookServer) {
    webhookServer.close();
    console.log('[WEBHOOK] 服务已停止');
    webhookServer = null;
  }
}

module.exports = {
  startWebhook,
  stopWebhook,
  handleCardCallback
};