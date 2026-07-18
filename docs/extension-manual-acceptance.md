# Extension 手工验收

第 1 至 7 节保留 Milestone 2A 本地模拟页验收。第 8 节用于 Milestone 2B-1 最小
DeepSeekAdapter 的真实 Edge 人工验收；只使用全新合成测试问答，不打开真实历史资料。

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
待重试数量均不得变化。重新启用后，暂停期间已经存在、开始或完成的问答仍不得补录；
只有恢复之后新产生的问答可以继续采集。

## 7. 自动检查

```powershell
.\scripts\test.ps1
.\scripts\test-extension.ps1
.\scripts\build-extension.ps1
```

若 PowerShell 阻止脚本，仅对当前窗口执行
`Set-ExecutionPolicy -Scope Process Bypass`。所有脚本都能通过完整路径从任意当前
目录运行。

## 8. Milestone 2B-1：Edge 真实页面验收

当前只验收普通文字问答。不要使用深度思考、停止生成、重新生成、编辑旧问题、上传
文件、图片、语音或联网搜索；这些结构会安全失败或尚未验证。

### 8.1 构建、加载和授权

1. 在仓库根目录运行：

   ```powershell
   .\scripts\setup.ps1
   .\scripts\setup-extension.ps1
   .\scripts\build-extension.ps1
   .\scripts\start.ps1 -DataDirectory .\.milestone-2b1-data
   ```

2. 打开 `edge://extensions`，开启开发人员模式，对 Study Inbox 点击“重新加载”；首次安装则选择“加载解压缩的扩展”，目录为 `apps\extension\dist`。
3. 打开 `https://chat.deepseek.com/`，只新建包含合成测试内容的对话。
4. 打开扩展 popup，展开“DeepSeek DOM 侦察（开发工具）”，勾选侦察开发模式并点击“主动授权 DeepSeek 页面”。授权成功后可关闭侦察开发模式；可选 host permission 会保留。
5. 回到 `edge://extensions` 确认扩展没有 `<all_urls>`、Cookie、history、downloads 或 webRequest 权限。
6. 刷新 DeepSeek 页面，使动态注册的 content script 在授权后加载。
7. 打开 popup，确认主开关“启用采集”已选中、本地服务在线。

### 8.2 单轮、流式和去重

1. 记录 `GET /api/v1/conversations` 当前数量。
2. 提交一条全新普通合成问题，观察回答逐步生成。
3. 生成期间反复查询 API，确认没有新增记录。
4. 回答停止变化且操作区出现后等待至少 2 秒，确认只新增一条记录。
5. 核对记录中的问题和最终回答，不应包含复制、点赞、重新生成按钮内容。
6. 刷新 DeepSeek 页面，等待至少 2 秒；确认数据库记录数量没有增加。扩展可能重新提交稳定历史事件，但相同 `event_id` 会由现有 API 去重为 `created=false`。

### 8.3 三轮配对

1. 新建一个合成对话，连续完成三轮内容明显不同的普通文字问答。
2. 每轮都等回答完成后再提交下一问。
3. 查询 API，确认新增三条记录，顺序与页面一致。
4. 分别核对每条助手回答只对应它之前最近的用户问题，没有跨轮配对。
5. 刷新页面并再次等待稳定窗口，确认三条记录均未重复写入。

### 8.4 暂停、离线和恢复

1. 记录 API 数量，在 popup 取消“启用采集”，再完成一条普通合成问答；等待超过稳定窗口，确认 API 和 RetryQueue 均不变化。
2. 重新启用采集，不提出新问题并等待超过稳定窗口，确认暂停期间的问答没有被历史扫描补录。
3. 刷新 DeepSeek 页面并重新加载扩展，再等待超过稳定窗口，确认该问答仍未补录。
4. 再次暂停，在暂停期间开始一条流式回答；正文开始出现后恢复采集，让回答自然完成，确认该问答始终不入库也不进入 RetryQueue。
5. 保持采集开启，提出一条全新的普通合成问题，确认它在完成后正常新增一次；刷新页面后不得重复新增。
6. 在 FastAPI 窗口按 `Ctrl+C`，然后完成另一条全新的普通合成问答。
7. 等待回答稳定后打开 popup，确认本地服务离线且待重试数量增加。
8. 用第 8.1 节命令恢复相同 `.milestone-2b1-data` FastAPI。
9. 刷新 DeepSeek 页面以触发同一稳定历史事件；该次成功投递会同时触发现有 RetryQueue 自动重试。
10. 确认待重试恢复为 0，同一问答在数据库中只有一个 `event_id`，没有重复写入。

DeepSeek 暂停抑制记录只保存 SHA-256 标识，不保存问题或回答正文；记录位于
`chrome.storage.local`，最多保留 500 个标识，超过上限时淘汰最旧标识。完成态会从
临时 turn 标识升级为精确 `event_id`，避免长期依赖页面 key。

现有后台没有定时健康轮询；如果恢复服务后不刷新页面、不产生新成功提交且不重启浏览器，队列不会立即自行唤醒。此时可点击 popup 的“立即重试”。

### 8.5 验收记录

记录 Edge 版本、扩展构建 commit、授权状态、单轮新增数、三轮新增数、刷新后新增数、
离线队列数和恢复后数据库记录数。若 DOM 无法识别或状态不确定，预期行为是不记录，
不得为了通过验收切换到哈希 class 或固定 key。

本节暂停语义修复后需要重新执行真实 Edge 验收，并记录暂停恢复、流式跨恢复、页面
刷新及扩展重新加载四项结果。
Desktop pytest：13 passed
存在一条第三方依赖 StarletteDeprecationWarning，
来源于 FastAPI TestClient，不影响当前测试和运行。
后续依赖升级里程碑中统一处理。
