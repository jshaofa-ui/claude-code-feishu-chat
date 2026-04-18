#!/bin/bash
# 发送审批卡片到飞书的辅助脚本

CHAT_ID="$1"
TITLE="${2:-审批请求}"
CONTENT="${3:-这是一个审批请求}"

if [ -z "$CHAT_ID" ]; then
    echo "用法: $0 <chat-id> [title] [content]"
    echo "示例: $0 oc_xxx \"请假审批\" \"张三申请请假3天\""
    exit 1
fi

# 生成交互式卡片JSON
CARD_JSON=$(cat <<EOF
{
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
            "action": "approve_request"
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
            "action": "reject_request"
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
            "action": "view_details"
          }
        }
      ]
    }
  ],
  "header": {
    "title": {
      "tag": "plain_text",
      "content": "$TITLE"
    },
    "template": "blue"
  },
  "modules": [
    {
      "tag": "section",
      "text": {
        "tag": "lark_md",
        "content": "$CONTENT"
      }
    }
  ]
}
EOF
)

echo "准备发送审批卡片到: $CHAT_ID"
echo "标题: $TITLE"
echo "内容: $CONTENT"

# 发送卡片到飞书
lark-cli im +messages-send --chat-id "$CHAT_ID" --msg-type interactive --content "$CARD_JSON" --as bot