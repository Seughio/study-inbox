# 豆包选择器侦察报告（Milestone 2C-0）

## 已确认边界

- 产品负责人提供的真实普通对话页形态：
  `https://www.doubao.com/chat/<conversation-id>`。
- 精确 origin：`https://www.doubao.com`。
- 最小可选 host permission：`https://www.doubao.com/*`。MV3 host permission 的路径部分
  不能收窄到 `/chat/*`，所以由运行时 controller 再执行路径限制。
- 未发现或声明 hash 路由；侦察入口明确拒绝非空 hash。
- 本阶段不注册豆包 content script，不实现 `DoubaoAdapter`。

## 证据状态

截至 Milestone 2C-0，仓库内四份豆包 fixture 已由产品负责人从真实页面采集，经通用
脱敏器处理并人工复核。以下选择器已确认可解析并覆盖本批 fixture：

```css
[data-target-id="message-box-target-id"]:has(.bg-g-send-msg-bubble-bg) .md-box-root
[data-target-id="message-box-target-id"]:not(:has(.bg-g-send-msg-bubble-bg)) .md-box-root
```

这些选择器只用于 fixture 结构验证，不能据此认定为 `DoubaoAdapter` 的跨版本稳定选择器。
fixture 显示对话使用虚拟列表结构；`multi-turn` 的六个消息壳按用户、助手顺序形成三组；
流式助手正文的 `data-streaming` 在进行态为 `true`、完成态为 `false`。DOM 替换、复用、
跨页面版本稳定性和更长历史的虚拟化行为仍未确认。

禁止根据产品名称、可见正文、页面标题或其他站点结构推断上述选择器。

## 四组 fixture 证据

| fixture | 需要确认的证据 | 当前状态 |
| --- | --- | --- |
| `ordinary-completed.html` | 单轮用户/助手节点、共同范围、完成态 | 正式脱敏 fixture，1 + 1 |
| `multi-turn.html` | 三轮用户到助手的 DOM 顺序 | 正式脱敏 fixture，3 + 3 |
| `streaming-in-progress.html` | 助手正文 `data-streaming="true"` | 正式脱敏 fixture，1 + 1 |
| `streaming-completed.html` | 助手正文 `data-streaming="false"` | 正式脱敏 fixture，1 + 1 |

每次采集后需要记录：不含正文的 DOM 路径/标签摘要、候选用户和助手选择器、各选择器匹配
数量、`report.json` 检查结果、人工敏感信息复核结果，以及进行态到完成态的结构差异。

## 明确排除项

首页、hash 路由、分享页、智能体/Bot 页面、移动版、登录页，以及文件、图片、语音、联网
引用、深度思考、停止、重新生成、编辑、错误态和分支对话均不在本轮选择器证据范围内。
本报告不授权实现 `DoubaoAdapter`；开始适配器仍需独立里程碑和选择器稳定性评审。
