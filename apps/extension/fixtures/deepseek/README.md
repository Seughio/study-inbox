# DeepSeek 脱敏 DOM fixture

本目录当前仅包含占位文件，**没有任何文件来自真实 DeepSeek 页面，也没有确认任何选择器**。
占位文件不能用于实现或验证 `DeepSeekAdapter`。

只有同时满足以下条件，才可替换占位文件：

1. 用户在全新、仅含合成内容的对话中主动导出单个对话节点；
2. 原始 HTML 始终保存在仓库外；
3. 使用 `tools/sanitize-deepseek-fixture.mjs` 脱敏且敏感检测通过；
4. 用户人工检查脱敏 HTML 和结构差异报告；
5. 在 `docs/deepseek-selector-report.md` 记录真实依据、日期和对应 fixture。

| 文件 | 真实结构状态 |
| --- | --- |
| `ordinary-completed.html` | 缺失，仅占位 |
| `streaming.html` | 缺失，仅占位 |
| `reasoning-completed.html` | 缺失，仅占位 |
| `multi-turn.html` | 缺失，仅占位 |
| `regenerated.html` | 缺失，仅占位 |
| `stopped.html` | 缺失，仅占位 |
| `incomplete.html` | 缺失，仅占位 |

原始导出物、截图、账号信息和真实消息正文不得提交到本目录。
