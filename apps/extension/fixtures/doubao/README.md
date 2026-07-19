# 豆包脱敏 DOM fixture

本目录在 Milestone 2C-0 只建立安全占位文件。占位内容不是豆包 DOM 证据，不能用于实现
`DoubaoAdapter` 或选择器。

第一阶段需要由产品负责人从已确认域名的真实豆包对话页主动采集并脱敏四种状态：

- `ordinary-completed.html`：单轮普通文字回答已完成；
- `multi-turn.html`：至少三轮普通文字对话；
- `streaming-in-progress.html`：回答仍在流式生成；
- `streaming-completed.html`：同一类回答结束流式生成后。

原始 HTML 必须始终保存在仓库外。仓库只接收通用脱敏器生成的 HTML、对应
`report.json` 和人工复核结果。禁止提交真实正文、账号资料、会话标识、分享链接、Cookie、
浏览器存储内容或数据库。
