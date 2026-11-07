# Study Inbox Desktop

本地 FastAPI 服务接收单轮问答事件，用分类器判断学科、知识点、独立问题和回答摘要，
将结果保存在 SQLite 中，并按学科导出 Markdown。默认使用确定性的
`MockClassifier`；可按下文“真实 LLM 分类”选择性启用 `LLMClassifier`。

## 环境要求

- Python 3.11 或更高版本

在仓库根目录运行：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".\apps\desktop[dev]"
```

## 启动

```powershell
python -m uvicorn study_inbox.app:create_app --factory --host 127.0.0.1 --port 8765
```

服务只应绑定到 `127.0.0.1`。开发文档位于
`http://127.0.0.1:8765/docs`。

可通过环境变量配置本地数据位置：

- `STUDY_INBOX_DATA_DIR`：默认数据目录，默认为 `~/.study-inbox`；
- `STUDY_INBOX_DATABASE`：SQLite 文件路径，优先于默认数据目录；
- `STUDY_INBOX_EXPORT_DIR`：Markdown 输出目录，优先于默认数据目录。

请求示例：

```powershell
$body = @{
  event_id = "example-001"
  source = "chatgpt"
  conversation_id = "sanitized-example"
  question = "请解释数学中的一元二次方程。"
  answer = "一元二次方程的一般形式是 ax² + bx + c = 0。"
  captured_at = "2026-01-02T03:04:05Z"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8765/api/v1/conversations `
  -ContentType application/json -Body $body
```

接口：

- `GET /health`
- `POST /api/v1/conversations`
- `GET /api/v1/conversations`
- `POST /api/v1/export/markdown`

## 真实 LLM 分类

默认不调用任何远程服务。设置以下环境变量后，服务改用 `LLMClassifier`，通过
OpenAI 兼容的 `/chat/completions` 接口（默认 DeepSeek）完成学习判断、学科与知识点
识别、独立问题改写和回答摘要：

```powershell
$env:STUDY_INBOX_CLASSIFIER = "llm"
$env:STUDY_INBOX_LLM_API_KEY = "<你的 API Key>"
# 可选：
# $env:STUDY_INBOX_LLM_BASE_URL = "https://api.deepseek.com"
# $env:STUDY_INBOX_LLM_MODEL = "deepseek-chat"
# $env:STUDY_INBOX_LLM_TIMEOUT = "30"
.\scripts\start.ps1
```

- 启用后，每条**新**问答的问题和回答（各自截断到 4000 / 8000 字）会发送到所配置的
  LLM 服务；包括非学习内容，因为是否学习正是由模型判断的。重复 `event_id` 直接返回
  已有记录，不会再次调用模型。
- 模型输出经过校验：学科必须是安全的小写 slug（会成为 Markdown 文件名），字段缺失或
  非法时重试一次。
- 模型不可用（网络错误、超时、额度不足、输出持续非法）时接口返回 `503` 且不写入记录，
  扩展会把事件放入离线重试队列稍后重发。不会回退到 MockClassifier，因为已写入的
  分类结果不会被覆盖。
- API Key 只从环境变量读取，不写入数据库、日志、`/health` 或错误信息。
- 启用前已经用 MockClassifier 写入的记录保持不变。

输入由仓库根目录的 `contracts/conversation-event.schema.json` 校验。
相同 `event_id` 的后续请求不会覆盖第一次写入的记录。非学习事件会保留以保证
幂等，但不会进入 Markdown 导出。

## 测试与检查

推荐从仓库根目录使用 Windows 脚本：

```powershell
.\scripts\test.ps1
```

也可以分别运行：

```powershell
python -m pytest apps/desktop/tests
python -m ruff check apps/desktop
python -m ruff format --check apps/desktop
python -m mypy apps/desktop/src
```

测试全部使用清理过的合成数据、临时 SQLite 数据库和临时导出目录。

## Milestone 3A-0 知识库基础

桌面端现在包含版本化的本地知识库 schema 和独立领域模型，同时保留现有
`conversations` 表及 API 语义。`KnowledgeDocument`、虚拟 `Collection`、`Tag`、
`Attachment`、`KnowledgeSource` 和 `IngestEvent` 的边界、数据所有权规则及后续
物化流程见 [知识库数据模型](../../docs/knowledge-library-data-model.md)。本阶段尚未
提供知识库 CRUD、全文搜索或桌面 UI，也不会自动复制或移动用户文件。
