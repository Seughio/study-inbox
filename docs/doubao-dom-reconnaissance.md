# 豆包 DOM 人工侦察指南（Milestone 2C-0）

本阶段只采集普通豆包对话页的脱敏 DOM 证据，不实现 `DoubaoAdapter`，不采集真实学习
内容。产品负责人确认的真实页面形态是
`https://www.doubao.com/chat/<conversation-id>`，精确 origin 是
`https://www.doubao.com`。

## 权限与页面边界

Manifest V3 的 host permission 无法按 URL 路径进一步收窄，因此 manifest 中声明的最小
可选权限是 `https://www.doubao.com/*`。它不是必需权限，不包含子域名、HTTP 或其他
origin。豆包首页和普通对话页属于同一 origin，不需要两份权限；侦察 controller 仍会
额外检查路径，只接受 `/chat/<非空 conversation-id>`，拒绝首页、其他路径和带 hash 的
路由。

2C-0 不注册豆包 content script。每次侦察操作都由用户在 popup 中主动触发
`chrome.scripting.executeScript`。未授权、开发模式关闭、页面不匹配或注入失败时安全
停止。工具不读取 Cookie、Local Storage、Session Storage，不监听或发起网络请求。

## 授权与选择范围

1. 构建并加载解压缩扩展，只打开一份全新合成测试对话。不要打开真实历史对话。
2. 进入 `https://www.doubao.com/chat/<conversation-id>` 普通对话页。
3. 打开 popup，展开“豆包侦察（开发工具）”，勾选“我已启用豆包侦察”。
4. 点击“主动授权豆包页面”，确认浏览器显示的 `https://www.doubao.com/*` 可选权限。
5. 点击“选择单个对话节点”，悬停查看半透明 overlay。滚轮或方向键向上选择父节点、
   向下返回子节点；Enter 或左键确认，Escape 取消。
6. 选中的范围必须同时包含至少一条合成用户问题和对应的合成助手回答，并尽量排除侧边
   导航、账号区域、输入框、其他历史标题和页面级容器。popup 的范围过大/过小警告必须
   人工处理，不能忽略后直接提交。
7. 先复制“不含正文”的节点摘要，记录 DOM 路径、标签、ID、class、`data-*`/`aria-*`
   属性名和结构。确认范围后才点击“读取待脱敏 HTML”。
8. 读取完成后立即复制到仓库外的私有临时目录，例如
   `C:\private-temp\study-inbox-doubao\raw-node.html`，然后点击“清除豆包选择”。原始 HTML
   只在页面内存和负责人选择的仓库外临时文件中短暂停留；扩展不会写入
   `chrome.storage`。
9. 完成全部采集后点击“撤销豆包页面权限”。撤销会先取消豆包选择模式并清除当前豆包页
   的页面内存记录，不影响 DeepSeek 权限或选择状态。

## 确定两个脱敏选择器

在仓库外的原始副本上离线检查 DOM：

1. 从已选共同范围中分别找到用户消息节点和助手消息节点。
2. 选择器必须依据重复出现的结构、角色属性或稳定容器关系；不要依据正文、页面标题、
   会话 ID、生成内容或某个合成句子。
3. 在 `ordinary-completed` 和 `multi-turn` 原始副本上分别运行
   `querySelectorAll`，确认用户选择器只匹配用户消息、助手选择器只匹配助手消息，数量与
   人工记录一致。
4. 流式进行态与完成态分别复核，不能因为二者文本相似就猜测角色或完成状态。
5. 把候选和证据写入 `docs/doubao-selector-report.md`；在真实脱敏 fixture 进入仓库前，
   选择器状态始终是“未确认”。

## 运行通用脱敏器

原始输入必须位于 Git 仓库之外。输出文件必须尚不存在，避免覆盖人工检查过的 fixture。

```powershell
node .\apps\extension\tools\sanitize-chat-fixture.mjs `
  --input C:\private-temp\study-inbox-doubao\raw-node.html `
  --output .\apps\extension\fixtures\doubao\ordinary-completed.html `
  --user-selector '<人工确认的用户节点选择器>' `
  --assistant-selector '<人工确认的助手节点选择器>'
```

脚本不会内置豆包选择器，也不会根据正文或页面名称猜角色。它删除脚本、样式、媒体与
事件属性，清理链接查询参数，脱敏敏感属性，用固定合成正文替换匹配到的用户/助手文本，
再扫描疑似邮箱、手机号、token、随机标识和文件名。原 DeepSeek 命令
`sanitize-deepseek-fixture.mjs` 仍是同一实现的兼容入口。

## 检查 report.json 与人工复核

脚本在输出旁生成 `<fixture>.report.json`，例如
`ordinary-completed.html.report.json`。逐项检查：

- `matchedMessageNodes.user` 和 `.assistant` 都大于零，且与人工计数一致；
- `removed.scripts`、`styles`、`media` 和 `eventAttributes` 与原始结构相符；
- `sensitiveFindingTypes` 必须为空；
- 脱敏 HTML 中只有固定合成正文，不含账号资料、真实提示词、真实回答、会话 ID、分享
  URL 查询参数、文件名或长随机字符串；
- 标签层级、class 及用于选择器判断的非敏感 `data-*`/`aria-*` 结构仍足够复现。

检测器通过不等于可以直接提交。必须再由人工全文检查 HTML 和 report；发现任何不确定
内容就删除输出、改进规则后从仓库外原始副本重新生成。

## 第一阶段 fixture 与禁止提交内容

第一阶段需要四份真实结构、完全脱敏的 fixture：

- `ordinary-completed.html`；
- `multi-turn.html`；
- `streaming-in-progress.html`；
- `streaming-completed.html`。

严禁提交 Git：原始 HTML、真实用户或助手正文、账号/头像/昵称、conversation ID、页面
完整 URL、Cookie、Local/Session Storage、访问 token、分享链接、上传文件信息、截图、
HAR、数据库或浏览器 profile。当前四份 HTML 是安全占位注释，不是结构证据。

## 暂不支持的页面状态

2C-0 仅侦察 `/chat/<conversation-id>` 普通文字对话。首页、带 hash 的路由、搜索/发现页、
智能体或 Bot 专页、分享页、登录/注册页、移动版、文件/图片/语音、联网引用、深度思考、
停止生成、重新生成、编辑消息、错误/限流、删除消息和多分支对话均未验证、暂不支持。
