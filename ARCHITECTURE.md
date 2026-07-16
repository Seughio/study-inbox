# Architecture

## Browser Extension

职责：

- 识别当前支持的网站
- 提取一轮用户消息和 AI 回答
- 识别回答是否完成
- 生成稳定的事件 ID
- 向本地客户端发送事件
- 监测浏览器下载并附加来源网页信息

扩展不得：

- 直接调用文件系统
- 保存 API 密钥
- 自动读取未授权网站
- 将完整浏览记录上传到云端

### Milestone 2A 平台公共核心

本阶段只支持项目自建的 `127.0.0.1:4173` 模拟页。数据流固定为：

LocalFixtureAdapter → content script → background service worker →
`127.0.0.1:8765` FastAPI。

适配器只负责识别页面、观察变化和提取问答；完成检测、事件 ID、传输和重试队列均
属于平台无关公共核心。第一个真实网站适配器计划为 DeepSeek，属于 Milestone 2B，
不得复用模拟页 DOM 作为真实网站选择器。

## Desktop Agent

职责：

- 提供仅监听 127.0.0.1 的本地 API
- 验证插件请求令牌
- 使用 SQLite 保存问答和文件记录
- 调用分类器
- 导出 Markdown
- 监控指定目录
- 提取文件文本
- 创建待确认的移动建议
- 执行和撤销文件移动

## Communication

开发阶段：

Extension → HTTP → 127.0.0.1 local service

产品化阶段：

Extension → Chrome Native Messaging → Desktop Agent
