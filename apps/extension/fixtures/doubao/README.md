# 豆包脱敏 DOM fixture

本目录的四份 HTML 已由产品负责人从真实豆包普通对话页主动采集，经通用脱敏器处理并
人工检查。仓库版本只保留固定合成正文、匿名化标识和用于离线结构验证的 DOM。

第一阶段包含四种状态：

- `ordinary-completed.html`：单轮普通文字回答已完成；
- `multi-turn.html`：至少三轮普通文字对话；
- `streaming-in-progress.html`：回答仍在流式生成；
- `streaming-completed.html`：同一类回答结束流式生成后。

原始 HTML 必须始终保存在仓库外。仓库只接收通用脱敏器生成的 HTML、对应
`report.json` 和人工复核结果。禁止提交真实正文、账号资料、会话标识、分享链接、Cookie、
浏览器存储内容或数据库。

测试中记录的用户/助手选择器只用于验证这批 fixture 的结构和匹配数量，不能据此认定为
跨版本稳定选择器，也不能在未单独评审的情况下用于实现 `DoubaoAdapter`。
