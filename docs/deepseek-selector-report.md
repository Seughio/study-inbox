# DeepSeek 选择器设计报告（Milestone 2B-0）

最近验证日期：2026-07-17。本报告只记录 DOM 侦察证据，不代表已经实现或可以开始实现 `DeepSeekAdapter`。未确认状态的安全行为仍为“不采集、不发送”。

## 证据来源与隐私复查

- Fixture：`apps/extension/fixtures/deepseek/ordinary-completed.html`
- 来源：用户从真实 DeepSeek 页面主动导出的单轮普通完成问答，经仓库脱敏器处理并由用户人工检查；原始 HTML 保存在仓库外，未加入 Git。
- 用户提供的脱敏报告：用户节点匹配 1 个、助手节点匹配 1 个、`sensitiveFindingTypes` 为空。
- 2026-07-17 再次使用当前 `detectSensitiveContent()` 扫描仓库 fixture：`sensitiveFindingTypes` 为空。
- 人工复查：正文仅有固定合成用户文本和固定合成助手文本；未发现邮箱、手机号、URL、URL token、文件名、账号、昵称、对话标题、对话 ID 或长随机标识。八位哈希式 class 属于页面构建结构信息，不是用户数据，但稳定性很低。

## 已从真实页面确认的结构事实

以下结论只确认该真实来源、脱敏后的普通完成 fixture 内的结构事实，不自动等同于跨会话稳定选择器。

1. 可见消息列表结构为：

   ```text
   .ds-virtual-list-items
     > .ds-virtual-list-visible-items
       > [data-virtual-list-item-key="1"]  用户项
       > [data-virtual-list-item-key="2"]  助手项
   ```

2. 用户正文节点在当前 fixture 中唯一匹配：

   ```css
   [data-virtual-list-item-key="1"] > .ds-message > .fbb737a4
   ```

   用户正文位于用户虚拟列表项的直接 `.ds-message` 子节点内。`.fbb737a4` 命名呈八位十六进制哈希特征，只能确认它在本 fixture 中命中，不能确认跨构建稳定。

3. 助手最终回答节点在当前 fixture 中唯一匹配：

   ```css
   [data-virtual-list-item-key="2"] > .ds-message > .ds-assistant-message-main-content
   ```

   最终回答节点同时具有 `.ds-markdown` 和 `.ds-assistant-message-main-content`。复制、重新生成、点赞等操作区是 `.ds-message` 的后续兄弟节点，不包含在最终回答节点中。

4. 用户项与助手项具有同一个直接父节点；助手项是用户项的紧邻后续兄弟节点。当前 DOM 顺序为用户在前、助手在后。

5. 当前两个虚拟列表项的 `data-virtual-list-item-key` 值分别为字符串 `1` 和 `2`。该 fixture 只能证明属性和值承载列表顺序，不能证明数字从 1 开始、固定奇偶角色、跨刷新不变或跨会话不重置。正式逻辑不得写死具体数字。

6. `.ds-message` 在 fixture 中匹配两个节点，分别是用户与助手的消息壳。它可帮助定位消息范围，但自身不能区分角色。

7. `.ds-assistant-message-main-content` 只匹配助手最终回答，名称具有明确语义，是目前最强的正式选择器候选；其跨流式、推理、停止、重生成和页面更新稳定性仍待验证。

## 候选选择器与安全行为

| 目标节点 | 正式候选 | 当前依据 | 风险与待验证点 | 失败时安全行为 | Fixture | 验证日期 |
| --- | --- | --- | --- | --- | --- | --- |
| 消息列表 | `.ds-virtual-list-items > .ds-virtual-list-visible-items` | 真实 fixture 中各唯一命中一次，名称具有虚拟列表语义 | 虚拟滚动可能重建、裁剪或替换可见项；class 稳定性仅验证一次 | 不启动观察 | `ordinary-completed.html` | 2026-07-17 |
| 虚拟列表项 | `[data-virtual-list-item-key]` | 两条消息各有该属性 | 只将属性存在和 DOM 顺序作为候选；不得写死值、奇偶或连续性 | 跳过缺少 key 或顺序歧义的项 | `ordinary-completed.html` | 2026-07-17 |
| 通用消息壳 | `[data-virtual-list-item-key] > .ds-message` | 用户和助手项各唯一包含一个直接消息壳 | `.ds-message` 无角色信息，必须结合助手语义节点和配对关系 | 无法判定角色时不生成事件 | `ordinary-completed.html` | 2026-07-17 |
| 助手最终回答 | `.ds-message > .ds-assistant-message-main-content` | 真实 fixture 中唯一命中；操作区位于其外部 | 仍需确认流式中是否提前出现、推理区是否分离、停止和重生成时是否替换 | 未确认完成时不发送 | `ordinary-completed.html` | 2026-07-17 |
| 助手 Markdown 辅助特征 | `.ds-assistant-message-main-content.ds-markdown` | 最终回答同时具有两个语义 class | 非 Markdown 回答或渲染状态可能不同，不应成为唯一条件 | 回退到经验证的最终回答语义节点；否则跳过 | `ordinary-completed.html` | 2026-07-17 |
| 用户项与助手项配对 | 助手项的紧邻前置兄弟项，并分别包含通用消息壳和助手最终回答 | 当前单轮 fixture 中关系成立 | 多轮、推理、错误提示、工具卡片或虚拟占位项可能插入中间；尚无稳定用户角色属性 | 关系不唯一时不配对 | `ordinary-completed.html` | 2026-07-17 |

当前没有足够证据给出独立、稳定的用户正文 CSS 选择器。正式候选应优先从已确认的助手项反向寻找经多轮验证的前置用户项，再在该用户项的直接 `.ds-message` 范围内提取正文；不能把 `.fbb737a4` 提升为正式选择器。

## 只能用于 fixture 脱敏的选择器

以下选择器可精确处理当前静态 fixture，但不能用于正式网页适配：

```css
[data-virtual-list-item-key="1"] > .ds-message > .fbb737a4
[data-virtual-list-item-key="2"] > .ds-message > .ds-assistant-message-main-content
```

原因：它们写死了当前 key 数字；用户选择器还依赖疑似自动生成的 `.fbb737a4`。它们只能用于复现本 fixture 的脱敏匹配结果。

## 明确不应依赖

| 属性或方式 | 结论 | 原因 |
| --- | --- | --- |
| `data-virtual-list-item-key="1"`、`"2"` 等具体值 | 不采用 | 只能作为当前 DOM 的顺序信息，无法证明固定、连续、奇偶角色或跨刷新稳定 |
| `.fbb737a4` | 不采用 | 八位十六进制命名高度疑似构建生成 class；只有单个 fixture 证据 |
| `_6f2c522`、`_9663006`、`_2c189bc`、`d29f3d7d`、`_63c77b1` 等哈希式 class | 不采用 | 缺乏语义且可能随构建变化 |
| `:nth-child()`、绝对子节点序号 | 不采用 | 多轮、虚拟滚动、控件插入和重新生成会改变位置 |
| `style` 中的高度、transform、padding 或 CSS 变量 | 不采用 | 由布局、窗口尺寸和虚拟滚动状态动态决定 |
| 复制、点赞、重新生成按钮或其 class | 不用于角色或完成判断 | 属于无关操作 DOM，可能延迟出现或发生后续变化 |
| 消息正文或按钮文案 | 不采用 | 内容敏感、语言相关且会变化 |
| URL、真实会话 ID、随机 DOM ID | 不采用 | 敏感或易变，且与消息语义无关 |

## 当前 fixture 的能力边界

当前 fixture **足以在 fixture 级测试中提取一轮已完成的普通文字问答**：用户正文和助手最终回答各唯一命中，用户项在前、助手项紧邻其后，助手操作区明确位于最终回答节点之外。

它仍然**不足以实现正式 DeepSeekAdapter**，因为没有证据确认：

- 独立、稳定的用户角色或用户正文属性；
- `data-virtual-list-item-key` 在多轮、刷新、切换会话和虚拟列表回收时的变化规则；
- 流式开始、生成中和完成的状态标志；
- 推理区与最终回答在真实 DOM 中的边界；
- 停止生成后的不完整状态；
- 重新生成时旧答案的保留、替换和版本关系；
- 编辑问题、页面刷新和历史切换后的 DOM 重建方式；
- 代码块、表格等结构在完成状态下是否仍使用相同最终回答容器。

## 下一步所需 fixture

建议按以下顺序补充真实来源、脱敏并人工确认的证据：

1. 第二份独立普通完成问答，以及同一轮刷新后的快照：验证 `.ds-*` 语义 class、用户节点结构和 key 是否变化。
2. `multi-turn.html`：至少三轮，确认用户/助手配对、key 顺序、虚拟列表裁剪和中间节点插入行为。
3. `streaming.html`：至少包含生成前、流式中、刚完成三个状态，确认最终回答节点何时出现及完成标志。
4. `reasoning-completed.html`：确认推理区与 `.ds-assistant-message-main-content` 的边界。
5. `regenerated.html`：包含重生成前、生成中和完成后，确认旧/新助手项及 key 的变化。
6. `stopped.html`：确认停止后的内容是否可与完整回答安全区分。
7. `incomplete.html`：覆盖空回答、缺用户节点、缺助手节点等安全失败情况。
8. 代码块和表格完成态 fixture：验证最终正文提取能保留结构化文本。

在这些状态得到真实、脱敏、用户确认的 fixture，并完成跨状态选择器验证前，不开始正式 `DeepSeekAdapter`。
