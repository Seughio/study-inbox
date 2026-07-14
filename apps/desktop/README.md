# Study Inbox Desktop

Milestone 1 提供一个仅用于本机开发的 FastAPI 服务。它接收单轮问答事件，
使用确定性的 `MockClassifier` 分类，将结果保存在 SQLite 中，并按学科导出
Markdown。当前没有浏览器插件、文件监控或真实 LLM 集成。

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

- `POST /api/v1/conversations`
- `GET /api/v1/conversations`
- `POST /api/v1/export/markdown`

输入由仓库根目录的 `contracts/conversation-event.schema.json` 校验。
相同 `event_id` 的后续请求不会覆盖第一次写入的记录。非学习事件会保留以保证
幂等，但不会进入 Markdown 导出。

## 测试与检查

```powershell
python -m pytest apps/desktop/tests
python -m ruff check apps/desktop
python -m ruff format --check apps/desktop
python -m mypy apps/desktop/src
```

测试全部使用清理过的合成数据、临时 SQLite 数据库和临时导出目录。
