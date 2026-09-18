# 豆包选择器报告（Milestone 2C-1）

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

## 综合 fixture 评审

### 普通完成态

`ordinary-completed.html` 的 `.list_items` 包含顶部占位项、一个用户消息行、一个助手消息
行和底部占位项。两个消息行各包含一个
`[data-target-id="message-box-target-id"]` 消息壳，壳的最近 `.v_list_row` 具有
`data-observe-row`，壳内各有一个 `data-message-id` 后代。用户正文位于发送气泡
`.bg-g-send-msg-bubble-bg` 内的唯一 `.md-box-root`；助手最终回答是无发送气泡消息壳内的
唯一 `.md-box-root`。用户操作区具有
`data-foundation-type="send-message-action-bar"`，助手操作区具有
`data-foundation-type="receive-message-action-bar"`，二者都是正文分支的兄弟区域，操作
按钮文本不进入正文节点。

### 三轮顺序与配对

`multi-turn.html` 有八个 `.list_items` 直接子项：顶部占位、六个消息行、底部占位。六个
消息壳依次为 `user, assistant, user, assistant, user, assistant`，确实形成三组相邻
问答。顶部/底部占位没有消息壳；非消息项和无正文项不参与配对。正式配对算法按 DOM
中的消息壳顺序，为助手寻找它之前最近的有效用户；若在到达用户前遇到另一个助手，或在
下一个用户前发现另一个助手版本，则整组安全失败。算法不读取正文、消息 ID 值或数字
规律。

### 流式进行态与完成态

两份 streaming fixture 中助手 `.md-box-root` 都已经存在。进行态为
`data-streaming="true"`，receive action bar 存在但没有完成操作按钮，并保留流式活动
结构；完成态为 `data-streaming="false"`，receive action bar 出现完成操作按钮及建议
区域。采集范围内没有可确认的停止按钮或输入框，且没有可作为完成依据的稳定 `aria-*`。
按钮数量、中文文案、建议区和带构建后缀的活动 class 都不是正式判断条件。适配器仅把
`data-streaming="true"` 视为明确生成中；`false` 仍交给公共 `CompletionDetector` 的
稳定窗口，正文变化会重新计时。

## 正式适配器候选结构

以下结构均在四份 fixture 中一致，Milestone 2C-1 可作为窄范围候选：

- 消息壳：`[data-target-id="message-box-target-id"]`；
- 虚拟消息行：最近的 `.v_list_row[data-observe-row]`；
- 消息内部标识：恰有一个 `[data-message-id]`，只检查属性存在，不读取值；
- 普通文本块：恰有一个 `[data-container-type="block-v2"]`、一个
  `[data-render-engine="node"][data-plugin-identifier="block_type:10000"]` 和一个
  `.md-box-root`；
- 用户角色：正文位于唯一 `.bg-g-send-msg-bubble-bg` 内，同时只有 send action bar；
- 助手角色：没有发送气泡，同时只有 receive action bar；
- 生成中：助手正文 `.md-box-root[data-streaming="true"]`；
- 完成候选：助手正文 `.md-box-root[data-streaming="false"]` 且 receive action bar 至少包含
  一个按钮，再经过公共稳定窗口；按钮文案和具体数量不参与判断。

`.md-box-root` 同时用于用户和助手，不能单独判断角色。`.bg-g-send-msg-bubble-bg` 在本批
fixture 中只出现在用户消息，名称也具有发送气泡语义，但正式实现还会与 send/receive
action bar 交叉验证。fixture 测试中的 `:has()` / `:not(:has())` 适合计数验证；正式
适配器使用逐壳结构检查，避免把复杂角色判断压进一个 CSS 选择器。

`data-target-id="message-box-target-id"` 在四种状态和三轮中一致，可作为消息壳候选；
`data-message-id` 和 `data-observe-row` 的原值已匿名化，证据只支持检查属性存在，绝不支持
读取、排序、比较或持久化具体值。

## 仅限 fixture/脱敏与明确禁止项

以下内容不得成为正式适配器依据：具体 `data-message-id`、具体 `data-observe-row`、URL
会话 ID/查询参数、随机 DOM ID、inline style、transform、尺寸、`nth-child`、绝对子节点
序号、消息正文、按钮中文文案，以及 `container-qX9Csx`、`content-KTJ1Rj`、
`inner-item-BjaxFt`、`message-action-bar-raqbg0` 等带构建哈希后缀的 class。

正文内出现链接、`pre`、`code`、表格、媒体、表单或可编辑区域，存在额外/未知插件块、
缺失角色交叉证据、多个正文、多个助手版本、空白或单字符占位时，Milestone 2C-1 均拒绝
记录。

## 明确排除项

首页、hash 路由、分享页、智能体/Bot 页面、移动版、登录页，以及文件、图片、语音、联网
引用、深度思考、停止、重新生成、编辑、错误态和分支对话均不在本轮选择器证据范围内。
本报告不授权实现 `DoubaoAdapter`；开始适配器仍需独立里程碑和选择器稳定性评审。
