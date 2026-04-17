/**
 * 飞书交互式卡片 JSON 模板
 * 使用飞书卡片 JSON 2.0 格式（behaviors 属性）
 * 参考 Hermes gateway/platforms/feishu.py send_exec_approval 实现
 */

/**
 * 构建审批确认卡片（使用 behaviors 格式）
 * @param {string} command - 待执行的命令内容
 * @param {string} description - 操作说明
 * @param {number} approvalId - 审批 ID
 * @returns {object} 卡片 JSON 结构
 */
function buildApprovalCard(command, description, approvalId) {
  const cmdPreview = command.length > 500
    ? command.substring(0, 500) + '...'
    : command;

  return {
    "config": { "wide_screen_mode": true },
    "header": {
      "title": { "tag": "plain_text", "content": "⚠️ 操作确认" },
      "template": "orange"
    },
    "elements": [
      {
        "tag": "markdown",
        "content": `待执行命令:\n\`\`\`\n${cmdPreview}\n\`\`\`\n**说明:** ${description}`
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "✅ 确认执行" },
            "type": "primary",
            "behaviors": [
              {
                "type": "callback",
                "value": { "approval_id": approvalId, "action": "approve" }
              }
            ]
          },
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "❌ 取消" },
            "type": "danger",
            "behaviors": [
              {
                "type": "callback",
                "value": { "approval_id": approvalId, "action": "deny" }
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * 构建已处理的审批卡片（用于回调响应）
 * @param {string} choice - 用户选择: 'approve' 或 'deny'
 * @param {string} userName - 操作者名称
 * @returns {object} 已处理的卡片 JSON 结构
 */
function buildResolvedCard(choice, userName) {
  const icon = choice === "deny" ? "❌" : "✅";
  const label = choice === "deny" ? "已取消" : "已批准";
  const template = choice === "deny" ? "red" : "green";

  return {
    "config": { "wide_screen_mode": true },
    "header": {
      "title": { "tag": "plain_text", "content": `${icon} ${label}` },
      "template": template
    },
    "elements": [
      {
        "tag": "markdown",
        "content": `${icon} **${label}** by ${userName}`
      }
    ]
  };
}

/**
 * 构建测试卡片（用于验证回调）
 * @returns {object} 测试卡片 JSON 结构
 */
function buildTestCard() {
  return {
    "config": { "wide_screen_mode": true },
    "header": {
      "title": { "tag": "plain_text", "content": "🧪 WebSocket 回调测试" },
      "template": "blue"
    },
    "elements": [
      {
        "tag": "div",
        "text": { "tag": "plain_text", "content": "点击按钮测试 card.action.trigger 回调是否正常" }
      },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "tag": "plain_text", "content": "✅ 点击测试" },
            "type": "primary",
            "behaviors": [
              {
                "type": "callback",
                "value": { "test": "ok", "timestamp": Date.now() }
              }
            ]
          }
        ]
      }
    ]
  };
}

module.exports = {
  buildApprovalCard,
  buildResolvedCard,
  buildTestCard
};