# DeepSeek 脱敏 DOM fixture

下表标记为“真实结构”的文件均由用户从真实 DeepSeek 页面主动导出，原始 HTML 保存在仓库外；仓库版本已经本地脱敏、敏感扫描和人工检查。正文是固定合成文本，不包含真实对话内容。

| 文件 | 结构状态 | 用途 |
| --- | --- | --- |
| `ordinary-completed.html` | 真实结构、已脱敏 | 第一份普通完成问答 |
| `ordinary-completed-2.html` | 真实结构、已脱敏 | 第二份独立普通完成问答 |
| `ordinary-completed-refreshed.html` | 真实结构、已脱敏 | 第二份问答刷新后快照 |
| `multi-turn.html` | 真实结构、已脱敏 | 完整三轮问答 |
| `streaming-in-progress.html` | 真实结构、已脱敏 | 流式生成中 |
| `streaming-completed.html` | 真实结构、已脱敏 | 流式完成后 |
| `streaming.html` | 仅占位 | 旧占位，不作为测试依据 |
| `reasoning-completed.html` | 仅占位 | 尚无真实推理结构 |
| `regenerated.html` | 仅占位 | 尚无真实重生成结构 |
| `stopped.html` | 仅占位 | 尚无真实停止结构 |
| `incomplete.html` | 仅占位 | 尚无真实不完整结构 |

多轮 fixture 的每轮正文因脱敏规则相同而重复；它用于验证真实 DOM 边界、顺序和配对。测试可在内存中把合成正文改为不同编号，以验证配对算法，但不会改变 fixture 文件。

原始导出物、截图、账号信息和真实消息正文不得提交到本目录。新增 fixture 必须继续通过脱敏器、敏感检测、人工复核和选择器报告登记。
