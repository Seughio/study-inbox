# DeepSeek 选择器设计报告（Milestone 2B-1）

最近验证日期：2026-07-18。本报告依据仓库内六份真实来源、脱敏并经人工检查的 fixture。它只支持最小普通文字问答适配，不把未验证结构推广到推理、停止、重生成、编辑、文件或联网搜索场景。

## Fixture 证据

| Fixture | 用户项 | 助手最终回答项 | 状态用途 |
| --- | ---: | ---: | --- |
| `ordinary-completed.html` | 1 | 1 | 第一份普通完成态 |
| `ordinary-completed-2.html` | 1 | 1 | 第二份独立普通完成态 |
| `ordinary-completed-refreshed.html` | 1 | 1 | 第二份普通问答刷新后快照 |
| `multi-turn.html` | 3 | 3 | 完整三轮快照 |
| `streaming-in-progress.html` | 1 | 1（正文仍在增长） | 流式生成中 |
| `streaming-completed.html` | 1 | 1 | 同类流式回答完成后 |

各 fixture 的脱敏报告 `sensitiveFindingTypes` 均为空，原始 HTML 不在仓库中。脱敏器把多轮正文替换为同一组合成问答，因此多轮 fixture 能验证三组 DOM 边界、顺序和配对，但不能用正文差异证明轮次身份。

## 已验证稳定结构

三份普通完成态均稳定存在：

```text
.ds-virtual-list-items
  > .ds-virtual-list-visible-items
    > [data-virtual-list-item-key]
      > .ds-message
```

助手最终回答在 `.ds-message` 直接子级中，同时具有：

```css
.ds-assistant-message-main-content.ds-markdown
```

三份普通 fixture 的顶层用户项、助手项、直接 `.ds-message` 和助手最终回答层级一致。`ordinary-completed-2.html` 与 `ordinary-completed-refreshed.html` 字节内容一致，刷新后 key、class 和层级均未变化；这只证明该次刷新证据，不保证所有未来页面版本都如此。

第一份与第二份普通 fixture 中，消息项和消息壳上的哈希 class 保持相同；第二份因回答内部包含不同渲染结构，额外出现 `_1210dd7`、`c03cafe9` 等哈希 class。所有哈希 class 都视为构建细节，不进入正式判断。

## 三轮顺序和配对

`multi-turn.html` 有且仅有六个 `[data-virtual-list-item-key]`，每个都是实际消息项，没有额外系统项、占位项或非消息虚拟列表项。DOM 顺序严格为：

```text
普通用户消息 → 助手最终回答
普通用户消息 → 助手最终回答
普通用户消息 → 助手最终回答
```

配对算法以助手最终回答为锚点，按 DOM 向前寻找最近的实际普通用户消息壳；跳过没有直接 `.ds-message` 的非消息虚拟项。遇到另一个助手项、角色不明确、用户消息不是单一普通文本结构或出现多版本助手结构时安全失败。算法不读取 key 数字，不依赖奇偶、连续性、哈希 class 或绝对子节点序号。

## 正式选择器候选

| 目标 | 选择器或判断 | Fixture 依据 | 用途与限制 |
| --- | --- | --- | --- |
| 虚拟列表项 | `[data-virtual-list-item-key]` | 六份 fixture 全部存在 | 只枚举和维持 DOM 顺序；值仅作当前节点的不透明观察 key，不解释数字语义 |
| 直接消息壳 | 项的直接子元素中 classList 包含 `ds-message` | 所有用户和助手项均唯一存在 | 避免 `nth-child`，用于确定消息范围 |
| 助手最终回答 | 直接消息壳的直接子元素同时包含 `ds-assistant-message-main-content` 和 `ds-markdown` | 所有助手项唯一存在 | 最强角色与正文候选；仅支持普通最终回答 |
| 普通用户正文 | 最近前置消息项的直接 `.ds-message` 文本 | 六份 fixture 中用户壳只含一个普通叶子正文 | 不依赖 `.fbb737a4`；遇到子结构、附件或角色歧义即拒绝 |
| 完成前置门槛 | 助手项是否已有 `.ds-message` 之外、包含操作控件的直接兄弟区 | 完成 fixture 有，生成中 fixture 无 | 缺少时标记 `streaming`；存在时只标记 `unknown`，不能直接证明完成 |

## 流式与完成状态依据

`streaming-in-progress.html` 中助手正文节点已经出现，并与完成态使用相同的 `.ds-assistant-message-main-content.ds-markdown` 结构位置。两个独立序列化快照不能证明浏览器运行时复用了同一个 Node 对象，只能证明语义结构保持一致。

生成中 fixture 的助手项只有 `.ds-message`；完成 fixture 在其后出现操作区和五个 `role="button"` 控件。两份 fixture 均没有可靠的 `aria-busy`、`data-state`、`data-status`、生成中属性或稳定停止按钮。哈希 class `_43c05b5` 只在完成快照出现，但明确禁止依赖。

因此：

1. 仅出现助手正文绝不代表完成。
2. 没有操作区时保守标记为 `streaming`，不启动完成提交。
3. 操作区出现后只转为 `unknown`，交给现有 `CompletionDetector` 稳定窗口。
4. 正文变化会更新 fingerprint、取消旧计时并重新计时。
5. 稳定窗口触发后，同一 key 和 fingerprint 只完成一次。
6. 操作区只能作为负向阻断门槛，不能单独作为可靠完成证明。

## 只能用于 fixture 脱敏

以下选择器能处理特定静态 fixture，但不得进入适配器：

```css
[data-virtual-list-item-key="1"] > .ds-message > .fbb737a4
[data-virtual-list-item-key="2"] > .ds-message > .ds-assistant-message-main-content
```

它们写死当前 key 数字，并且用户选择器依赖八位哈希 class。

## 明确禁止依赖

- 任意具体 `data-virtual-list-item-key` 数字、奇偶性或连续性；
- `.fbb737a4` 及 `_6f2c522`、`d29f3d7d`、`_43c05b5` 等八位哈希 class；
- `nth-child`、绝对子节点序号；
- inline style、transform、尺寸、位置；
- 实际消息正文或按钮中文文案；
- URL、会话 ID、随机 DOM ID；
- 复制、点赞、重新生成按钮本身作为完成证明；
- 刷新前 Node 对象引用。

## 当前可结构性拒绝的内容

- 推理或深度思考区；
- 同一用户问题对应多个助手版本；
- 编辑旧问题后的分支；
- 文件、图片、语音、代码块；
- 联网搜索结果、链接和引用卡片；
- 空问题、空回答或极短占位回答；
- 缺少直接消息壳、角色无法确认、助手正文不唯一；
- 用户消息不是单一普通文本叶子结构；
- 任何不符合六份 fixture 已验证边界的 DOM。

## 当前无法从 fixture 可靠区分的状态

现有 fixture 没有停止后的快照，也没有重新生成或编辑后的快照。如果停止后的节点或
原地替换后的新版本最终呈现为与普通完成态完全相同的语义结构，当前适配器无法仅凭
已验证 DOM 将其与普通完成回答区分。这些状态不属于本阶段支持范围，人工验收时不得
使用；在获得对应的真实、脱敏 fixture 前，不声明它们已被可靠拒绝。可见的多助手版本、
推理兄弟节点、空或极短正文等歧义结构仍会按上一节安全拒绝。

## 后续仍需 fixture

普通 fixture 中已经出现 Markdown 表格结构，当前只按可见文本提取，不承诺 Markdown 表格格式保真。正式扩大支持前还需要真实、脱敏、人工检查的：推理完成、停止、不完整、重生成多版本、编辑旧问题、文件/图片、代码块、表格格式保真、联网引用卡片，以及包含非消息虚拟项的多轮快照。当前不得从普通 fixture 推断这些结构。
