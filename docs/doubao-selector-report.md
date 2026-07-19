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

截至 Milestone 2C-0，仓库内四份豆包 fixture 都只是安全占位注释。尚无经人工采集、通用
脱敏器处理并复核的真实 DOM 结构，因此以下内容均未确认：

- 对话列表或虚拟滚动容器；
- 用户消息节点选择器；
- 助手消息节点选择器；
- 消息顺序与稳定标识；
- 流式进行态与完成态标志；
- DOM 替换、复用或原位更新行为。

禁止根据产品名称、可见正文、页面标题或其他站点结构推断上述选择器。

## 待填写的四组证据

| fixture | 需要确认的证据 | 当前状态 |
| --- | --- | --- |
| `ordinary-completed.html` | 单轮用户/助手节点、共同范围、完成态 | 安全占位，未采集 |
| `multi-turn.html` | 至少三轮顺序、节点复用与稳定属性 | 安全占位，未采集 |
| `streaming-in-progress.html` | 流式进行态的结构或属性证据 | 安全占位，未采集 |
| `streaming-completed.html` | 同类回答结束后的结构变化 | 安全占位，未采集 |

每次采集后需要记录：不含正文的 DOM 路径/标签摘要、候选用户和助手选择器、各选择器匹配
数量、`report.json` 检查结果、人工敏感信息复核结果，以及进行态到完成态的结构差异。

## 明确排除项

首页、hash 路由、分享页、智能体/Bot 页面、移动版、登录页，以及文件、图片、语音、联网
引用、深度思考、停止、重新生成、编辑、错误态和分支对话均不在本轮选择器证据范围内。
在四份真实脱敏 fixture 和对应测试完成前，不得开始 `DoubaoAdapter`。
