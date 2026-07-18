# Study Inbox Extension

Milestone 2A 是 Chrome/Edge Manifest V3 扩展的本地公共核心。它只在项目自建的
`http://127.0.0.1:4173` 模拟页运行，只向
`http://127.0.0.1:8765` 发送事件，不包含任何真实 AI 网站选择器。

Milestone 2B-1 增加由真实脱敏 fixture 验证的最小 `DeepSeekAdapter`，只支持普通文字
问答、三轮顺序配对、刷新历史扫描和基于稳定窗口的流式完成。DeepSeek content script
仅在用户授予可选主机权限后动态注册。DOM 侦察入口仍默认关闭；扩展不读取 Cookie、
Web Storage 或页面网络请求，也不会自动保存未脱敏 DOM。

## 数据流

```text
LocalFixtureAdapter 或 DeepSeekAdapter
  → content script / CompletionDetector / TurnProcessor
  → background service worker
  → LocalApiClient 或 chrome.storage.local RetryQueue
  → FastAPI → SQLite → Markdown
```

适配器不得调用 API 或管理队列。两个适配器复用同一个 CompletionDetector、
TurnProcessor、后台投递与 RetryQueue。后台固定 API origin，不接受页面传入 URL。

## 文本规范化与 event_id

规范化集中在 `src/shared/normalization.ts`：

1. CRLF 和 CR 统一为 LF；
2. 每行的制表符和连续水平空格折叠为一个空格；
3. 删除每行首尾空白；
4. 删除全文首尾空行；
5. 三个及以上连续换行折叠为两个。

`event_id` 是以下数组 JSON 表示的 SHA-256 十六进制摘要：`source`、
`conversation_id`、规范化问题、规范化最终答案。`captured_at` 不参与哈希，因此刷新、
DOM 重建和重复扫描不会改变 ID。推理区不进入最终答案或哈希。

## 开发命令

从仓库根目录运行：

```powershell
.\scripts\setup-extension.ps1
.\scripts\test-extension.ps1
.\scripts\build-extension.ps1
.\scripts\start-fixture-page.ps1
```

人工验收见 `docs/extension-manual-acceptance.md`。

DOM 侦察与脱敏流程见 `docs/deepseek-dom-reconnaissance.md`，选择器证据状态见
`docs/deepseek-selector-report.md`。真实脱敏 fixture 的状态见 `fixtures/deepseek/README.md`。
