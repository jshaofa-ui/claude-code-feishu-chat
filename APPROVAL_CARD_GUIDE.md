要实现通过飞书按钮来链接Claude的审批申请功能，需要以下步骤：

## 1. 配置飞书应用的回调URL
在飞书开发者后台，需要配置交互式卡片的请求URL，用于处理卡片中的按钮点击事件。

## 2. 发送包含按钮的交互式卡片
使用如下命令发送带有审批按钮的交互式卡片：

```bash
lark-cli im +messages-send --chat-id <chat-id> --msg-type interactive --content '{
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
          "type": "default",
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
      "content": "审批请求"
    },
    "template": "blue"
  },
  "modules": [
    {
      "tag": "section",
      "text": {
        "tag": "lark_md",
        "content": "**申请人**: 张三\n**申请类型**: 请假\n**申请时间**: 2023-01-01 至 2023-01-03\n**事由**: 生病需要休息"
      }
    }
  ]
}'
```

## 3. 服务器端处理
当用户点击按钮时，飞书会向您配置的回调URL发送POST请求，您的服务器需要处理这些请求并调用Claude Code进行相应的审批操作。

## 4. Claude Code处理审批
后端服务器收到卡片交互事件后，可以调用Claude Code的审批相关功能，如：
- /lark-approval instances.get 获取审批实例详情
- /lark-approval tasks.approve 同意审批任务
- /lark-approval tasks.reject 拒绝审批任务

## 5. 回复卡片更新
根据Claude Code的处理结果，向飞书返回更新后的卡片内容，通知用户审批结果。

## 注意事项
1. 需要在飞书开发者后台配置应用，获取App ID和App Secret
2. 需要部署一个服务器来处理卡片交互事件
3. 需要配置适当的权限和认证
4. 交互式卡片的回调URL需要公网可访问

这种方式可以实现通过飞书按钮来链接Claude的审批申请功能。