/**
 * 飞书 WebSocket 长连接模块
 * 使用 @larksuiteoapi/node-sdk 的 WSClient 和 EventDispatcher
 * 参考 claw-lark monitor.js 实现
 */

const Lark = require('@larksuiteoapi/node-sdk');
const { resolveApproval } = require('./approval');
const { buildResolvedCard } = require('./card');

let wsClient = null;

/**
 * 转换域名字符串为 SDK 常量
 */
function toLarkDomain(domain) {
  return domain === 'feishu' ? Lark.Domain.Feishu : Lark.Domain.Lark;
}

/**
 * 创建飞书 WebSocket 客户端
 */
function createWSClient(config) {
  return new Lark.WSClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    domain: toLarkDomain(config.feishu.domain || 'feishu'),
    loggerLevel: Lark.LoggerLevel.info,
    autoReconnect: true,
  });
}

/**
 * 创建事件分发器并注册事件处理器
 */
function createDispatcher(config, handlers) {
  return new Lark.EventDispatcher({
    encryptKey: config.feishu.encryptKey,
    verificationToken: config.feishu.verificationToken,
  }).register({
    // 消息接收事件
    'im.message.receive_v1': handlers.onMessage || handleDefaultMessage,

    // 卡片按钮点击回调 - 关键事件！
    'card.action.trigger': handlers.onCardAction || handleCardAction,

    // 消息表情回复事件
    'im.message.reaction.created_v1': handlers.onReactionCreated,

    // 消息撤回事件
    'im.message.recalled_v1': handlers.onMessageRecalled,
  });
}

/**
 * 启动 WebSocket 长连接
 */
async function startWebSocket(config, handlers) {
  console.log('[WS] 创建 WebSocket 客户端...');

  wsClient = createWSClient(config);
  const dispatcher = createDispatcher(config, handlers);

  try {
    await wsClient.start({ eventDispatcher: dispatcher });
    console.log('[WS] ✅ WebSocket 连接成功');
    console.log('[WS] 已注册事件: im.message.receive_v1, card.action.trigger');
    return true;
  } catch (err) {
    console.error('[WS] ❌ WebSocket 连接失败:', err.message);
    return false;
  }
}

/**
 * 停止 WebSocket 连接
 */
function stopWebSocket() {
  if (wsClient) {
    try {
      wsClient.close({ force: true });
      console.log('[WS] WebSocket 已关闭');
    } catch (err) {
      console.error('[WS] 关闭失败:', err.message);
    }
    wsClient = null;
  }
}

/**
 * 处理卡片按钮点击回调
 *
 * 飞书回调结构 (card.action.trigger):
 * {
 *   "schema": "2.0",
 *   "header": { "event_type": "card.action.trigger", ... },
 *   "event": {
 *     "operator": { "open_id": "ou_xxx" },
 *     "action": { "value": { "approval_id": 1, "action": "approve" }, "tag": "button" },
 *     "context": { "open_message_id": "om_xxx", "open_chat_id": "oc_xxx" }
 *   }
 * }
 *
 * 关键：必须在 3 秒内返回响应，否则卡片不会更新
 * 返回格式: { code: 0, card: { type: "raw", data: {...} } }
 */
function handleCardAction(data) {
  // 打印完整回调结构用于调试
  console.log('[CARD] 完整回调:', JSON.stringify(data, null, 2));

  // 飞书 SDK 传入的是完整事件对象
  const operator = data.operator || {};
  const action = data.action || {};
  const actionValue = action.value || {};

  const openId = operator.open_id || 'Unknown';
  const approvalId = actionValue.approval_id;
  const choice = actionValue.action;

  console.log(`[CARD] 操作者: ${openId}, 审批ID: ${approvalId}, 选择: ${choice}`);

  // 处理审批回调
  if (approvalId && choice) {
    resolveApproval(approvalId, choice);

    // 返回卡片更新响应（飞书要求的格式）
    const resolvedCard = buildResolvedCard(choice, openId);
    console.log('[CARD] 返回更新卡片:', JSON.stringify(resolvedCard));

    return {
      toast: { type: 'success', content: '操作成功' },
      card: { type: 'raw', data: resolvedCard }
    };
  }

  // 处理测试回调
  if (actionValue.test) {
    console.log('[CARD] 测试回调成功');
    return {
      toast: { type: 'success', content: '✅ WebSocket 回调正常！' },
      card: {
        type: 'raw',
        data: {
          config: { wide_screen_mode: true },
          header: {
            title: { tag: 'plain_text', content: '✅ 测试成功' },
            template: 'green'
          },
          elements: [
            { tag: 'markdown', content: `✅ **回调成功！**\n\n操作者: ${openId}\n时间: ${new Date().toISOString()}` }
          ]
        }
      }
    };
  }

  // 默认返回空响应
  console.log('[CARD] 未识别的回调，返回默认响应');
  return { toast: { type: 'info', content: '收到回调' } };
}

/**
 * 默认消息处理器
 */
function handleDefaultMessage(data) {
  console.log('[MSG] 收到消息:', JSON.stringify(data).substring(0, 200));
}

/**
 * 发送交互式卡片（使用 lark-cli）
 * Node SDK 也支持直接发送，但保持与项目架构一致使用 lark-cli
 */
function sendCard(chatId, cardJson) {
  const { exec } = require('child_process');
  const cardStr = JSON.stringify(cardJson);

  return new Promise((resolve, reject) => {
    const cmd = `lark-cli im +messages-send --chat-id "${chatId}" --msg-type interactive --content '${cardStr}' --as bot`;

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('[CARD] 发送失败:', err.message);
        reject(err);
      } else {
        console.log('[CARD] 发送成功');
        resolve(stdout);
      }
    });
  });
}

module.exports = {
  startWebSocket,
  stopWebSocket,
  handleCardAction,
  createWSClient,
  createDispatcher,
  sendCard
};