# Milestone 2A 扩展手工验收

本阶段只连接项目自建的本地模拟页，不访问或适配真实 DeepSeek、豆包、ChatGPT、
Gemini 页面。模拟页仅表达类似 DeepSeek 的文字问答、流式输出、推理区与最终答案
分离等产品场景，其 DOM 完全由本项目定义。

## 1. 安装与构建

在仓库根目录运行：

```powershell
.\scripts\setup.ps1
.\scripts\setup-extension.ps1
.\scripts\build-extension.ps1
```

构建产物位于 `apps\extension\dist`。

## 2. 启动独立 Milestone 2A 数据环境

第一个 PowerShell：

```powershell
.\scripts\start.ps1 -DataDirectory .\.milestone-2a-data
```

数据库为 `.milestone-2a-data\study-inbox.sqlite3`，Markdown 位于
`.milestone-2a-data\markdown`。该目录与 Milestone 1.5 demo 数据隔离。

第二个 PowerShell：

```powershell
.\scripts\start-fixture-page.ps1
```

打开 <http://127.0.0.1:4173>。

## 3. 加载解压缩扩展

Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`：

1. 开启“开发者模式”；
2. 选择“加载已解压的扩展程序”；
3. 选择 `apps\extension\dist`；
4. 固定 Study Inbox 图标并打开 popup；
5. 确认“启用采集”选中、本地服务在线、待重试为 0。

## 4. 流式、去重和导出

1. 在模拟页点击“流式学习回答”；
2. 输出追加期间刷新 popup，确认最近发送尚未变化；
3. 页面显示“流式回答已完成”后，确认最近发送变为 `sent`；
4. 再次点击同一场景，完成后 popup 显示 `duplicate`；
5. 在 <http://127.0.0.1:8765/docs> 调用
   `POST /api/v1/export/markdown`；
6. 打开 `.milestone-2a-data\markdown\physics.md`，确认热力学内容只按唯一
   `event_id` 导出一次；
7. 点击“非学习问答”并再次导出，确认午餐内容不存在于任何 Markdown。

还应分别点击多轮、推理与最终答案、代码块、Markdown 表格、无关 DOM 变化、
重新生成、空回答、结构不完整和刷新重载按钮。空回答与结构不完整不得产生事件；
推理区内容不得混入最终答案。

## 5. 离线队列恢复

1. 在 FastAPI 窗口按 `Ctrl+C`；
2. 在模拟页生成一条新学习问答；
3. popup 应显示本地服务离线、待重试数量增加；
4. 用第 2 节相同命令恢复 FastAPI；
5. 点击 popup 的“立即重试”；
6. 确认待重试恢复为 0，最近发送为 `sent`；
7. 查询 API 记录，确认离线事件已写入。

队列按 `event_id` 去重，最多保留 100 条；超过上限时移除最旧事件。队列只存在
`chrome.storage.local`，不会发送到公网，也不会保存完整服务器错误正文。

## 6. 暂停验证

在 popup 取消“启用采集”，再点击模拟页任意场景。等待超过稳定时间后，API 记录和
待重试数量均不得变化。重新启用后才能继续采集。

## 7. 自动检查

```powershell
.\scripts\test.ps1
.\scripts\test-extension.ps1
.\scripts\build-extension.ps1
```

若 PowerShell 阻止脚本，仅对当前窗口执行
`Set-ExecutionPolicy -Scope Process Bypass`。所有脚本都能通过完整路径从任意当前
目录运行。
