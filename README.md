# Study Inbox

Study Inbox 自动整理已经产生的学习问答。Milestone 2A 在现有本地 FastAPI、
SQLite 和 Markdown 闭环上增加了平台无关的 Manifest V3 扩展公共核心与本地模拟页。

Milestone 2B-0 增加了由用户主动授权、主动点击才运行的 DeepSeek DOM 侦察开发工具，
但尚未实现真实网站适配器或选择器。它不读取 Cookie、Web Storage 或网络请求。
项目仍不包含文件监控、真实 LLM 或复杂前端。

## 5 分钟快速验收

环境要求：Windows 10/11、PowerShell 和 Python 3.11 或更高版本。

在仓库根目录运行：

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

保持服务窗口运行，然后打开另一个 PowerShell 窗口；即使当前目录不是仓库目录，
也可以用脚本的完整路径运行：

```powershell
.\scripts\demo.ps1
```

演示会逐项显示中文的 `[通过]` 或 `[失败]`，失败时返回非零退出码。默认数据只会
写入仓库的 `.demo-data`：

- 数据库：`.demo-data\study-inbox.sqlite3`
- Markdown：`.demo-data\markdown`

接口文档位于 <http://127.0.0.1:8765/docs>，健康状态位于
<http://127.0.0.1:8765/health>。

完整的非开发者验收步骤见 [手工验收指南](docs/manual-acceptance.md)，分类范围见
[MockClassifier 规则](docs/mock-classifier-rules.md)。开发说明见
[Desktop README](apps/desktop/README.md)。

## Milestone 2A 扩展验收

扩展安装、构建、本地模拟页面和离线队列验收步骤见
[Extension 手工验收指南](docs/extension-manual-acceptance.md)。

## Milestone 2B-0 DOM 侦察

DeepSeek 侦察、单节点导出和隐私检查流程见
[DeepSeek DOM 人工侦察指南](docs/deepseek-dom-reconnaissance.md)，当前证据与明确排除项见
[DeepSeek 选择器设计报告](docs/deepseek-selector-report.md)。仓库目前只有占位 fixture，
没有真实 DeepSeek DOM；满足报告中的输入条件前不得开始正式适配器。

## 自动检查

```powershell
.\scripts\test.ps1
```

测试优先使用仓库内独立的 `.pytest-tmp`；如果该目录因历史 ACL 不可写，会自动
改用仓库内唯一的 `.pytest-tmp-fallback-*`。脚本不会读取或删除用户已有数据。
