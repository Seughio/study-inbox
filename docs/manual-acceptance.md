# Milestone 1.5 手工验收指南

本文面向不需要阅读 Python 源代码的产品验收人员。所有操作都在 Windows
PowerShell 中完成。

## 第一次安装

确认电脑已安装 Python 3.11 或更高版本：

```powershell
python --version
```

进入仓库后运行：

```powershell
.\scripts\setup.ps1
```

脚本会创建或复用仓库内的 `.venv`，并安装 Desktop 服务及测试工具。脚本可以从
任意当前目录通过完整路径调用，例如：

```powershell
& "D:\Desktop\study-inbox\scripts\setup.ps1"
```

## 启动服务

```powershell
.\scripts\start.ps1
```

看到服务地址、数据库路径和 Markdown 路径后，保持该窗口运行。服务只监听
`127.0.0.1:8765`，不会向局域网开放。

在浏览器打开 <http://127.0.0.1:8765/docs>，可以看到 `/health`、问答写入、
记录查询和 Markdown 导出接口。

## 运行一键演示

打开另一个 PowerShell 窗口并运行：

```powershell
.\scripts\demo.ps1
```

脚本会检查服务路径安全性，然后提交两条不同学科的学习问答、一条非学习问答和
一次重复事件。每一步都会显示 `[通过]` 或 `[失败]`；任何失败都会让脚本返回非零
退出码。

## 数据实际保存位置

默认演示只使用仓库内的独立目录：

- SQLite：`.demo-data\study-inbox.sqlite3`
- Markdown：`.demo-data\markdown\physics.md` 和
  `.demo-data\markdown\computer-science.md`

`start.ps1` 启动时会显示绝对路径，`demo.ps1` 完成时也会再次显示。`/health`
返回相同路径。演示脚本发现服务使用其他路径时，会在提交数据前停止。

## 手工验证去重

一键演示会连续两次提交相同 `event_id`：首次响应的 `created` 为 `true`，第二次
为 `false`。演示还会检查该轮唯一标记和 event ID 在对应 Markdown 中只出现一次。

如需在接口文档中手工验证，可在 `/docs` 展开
`POST /api/v1/conversations`，连续两次发送完全相同的 JSON，并比较 `created`。

## 手工验证非学习内容不会导出

演示提交的午餐问答会保存在 SQLite 中并标记为 `is_learning=false`，但演示会扫描
全部 Markdown，确认本轮非学习标记不存在。也可以打开 `.demo-data\markdown` 下的
文件并搜索“午餐演示标记”。

## 清理演示数据

先在运行服务的窗口按 `Ctrl+C`。确认路径确实是当前仓库下的 `.demo-data` 后，
再由用户主动执行：

```powershell
Remove-Item -Recurse -Force .\.demo-data
```

任何脚本都不会自动删除已有演示数据或用户数据。再次启动时会重新创建 demo
目录。

## 常见错误

### PowerShell 禁止运行脚本

仅对当前 PowerShell 进程临时放行，然后重试：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

### 找不到 Python

安装 Python 3.11 或更高版本，并重新打开 PowerShell，确认 `python --version`
成功后再运行 `setup.ps1`。

### 找不到 `.venv`

先运行 `scripts\setup.ps1`。不要直接复制其他电脑上的虚拟环境。

### 8765 端口被占用

关闭之前启动的 Study Inbox 服务。也可以让启动和演示脚本使用相同的新端口：

```powershell
.\scripts\start.ps1 -Port 8877
.\scripts\demo.ps1 -BaseUrl http://127.0.0.1:8877
```

### demo 提示数据目录不安全

当前端口上的服务不是由默认 `start.ps1` 启动，或启动时指定了不同数据目录。
停止该服务，并使用默认命令重新启动。不要为了绕过检查而把演示指向真实数据目录。

### 测试出现临时目录或 `.pytest_cache` 权限错误

使用 `scripts\test.ps1`。它会优先把 pytest 临时文件放入仓库的 `.pytest-tmp`；
若该目录因历史 ACL 不可写，则自动改用仓库内的 `.pytest-tmp-fallback-*`。脚本还
会禁用 pytest cache provider，避免用户目录或旧 `.pytest_cache` 权限影响结果。
