# Milestone 3A-0：本地知识库数据模型

## 目标

Study Inbox 从 Milestone 3A 开始以本地知识工作台为产品中心。浏览器扩展和以后
的文件导入器只是内容入口；用户最终浏览、编辑和组织的是知识文档，而不是传输
事件或磁盘目录。

本里程碑只定义领域模型、SQLite 表、约束和迁移机制，不增加知识库 API、桌面
界面、自动分类、全文搜索或文件操作。

## 模型关系

```text
KnowledgeSource 1 ─── * IngestEvent
       │                    │
       │                    └── 0..1 KnowledgeDocument
       └────────────── 0..* KnowledgeDocument

KnowledgeDocument * ─── * Collection
KnowledgeDocument * ─── * Tag
KnowledgeDocument 1 ─── * Attachment
```

### IngestEvent

`IngestEvent` 是某个入口交给本地应用的不可变交付记录。它负责幂等、处理状态和
来源追踪，不是用户编辑的笔记。

- `kind`：`conversation_turn`、`file_import` 或 `manual`；
- `status`：`received`、`materialized`、`ignored` 或 `failed`；
- `external_event_id`：入口提供的幂等键，可以为空，但非空时必须唯一；
- 只有 `materialized` 事件可以且必须指向一个文档。

Milestone 2 的 `conversations` 表继续保存已经验收的对话事件。本阶段不迁移、
回填或双写这些记录，避免改变扩展投递语义。将对话事件物化为 Inbox 文档属于
下一个纵向功能里程碑。

### KnowledgeSource

`KnowledgeSource` 描述内容来自哪里：

- `conversation`：必须有 provider，可以保存本地使用的外部引用；
- `local_file`：必须保留原始路径，不代表应用已经复制或移动文件；
- `manual`：用户在应用内创建，不绑定外部资源。

来源和整理后的文档分离，因此用户可以修改文档而不篡改来源记录。
`external_ref` 和 `original_path` 只保存在本地数据库，不进入遥测或远程服务。

### KnowledgeDocument

`KnowledgeDocument` 是桌面应用中的主要可编辑对象。

- `kind`：来源文档 `source`、普通笔记 `note`、知识点 `knowledge_point`；
- `status`：待整理 `inbox`、已整理 `organized`、归档 `archived`；
- 正文统一保存为 Markdown；
- 第一版最多指向一个主要来源；跨来源引用留待后续单独建模。

删除或整理文档不得自动删除来源、原始对话或用户文件。

### Collection

`Collection` 是虚拟文件夹，不对应磁盘目录。文档和集合是多对多关系，因此一个
文档可以同时出现在多个集合中。集合可以通过 `parent_id` 形成树，同一父集合下
的名称不区分大小写且不能重复。

把文档加入、移出或重命名集合不会移动任何用户文件。

### Tag

标签与文档是多对多关系。标签名称不区分大小写且全局唯一。标签用于横向组织，
集合用于用户可见的层级组织，两者不互相替代。

### Attachment

附件属于文档，明确区分两种存储方式：

- `reference`：只引用原始路径；
- `managed_copy`：指向应用受管 Vault 中的副本。

两种路径不能同时存在。当前里程碑只建立模型，不复制、不移动、不删除文件。
未来执行复制或移动前仍须获得用户明确授权；移动必须记录并可撤销。

## 数据所有权和不变量

1. 原始对话、路径和附件信息默认只保存在本机。
2. 采集事件不可被文档编辑覆盖。
3. UI 文件夹是数据库关系，不触发物理文件移动。
4. 外键删除默认采用限制策略；只有文档与标签、集合、附件的从属关系可以级联。
5. 应用生成稳定、不含正文的 ID；数据库不从标题、路径或正文推导 ID。
6. 时间以带时区的 RFC 3339 字符串写入 SQLite；领域模型使用带时区的
   `datetime`。
7. 所有数据库连接启用 SQLite foreign keys。

## 迁移策略

`schema_migrations` 记录已经应用的版本。迁移按版本递增、在事务中执行，并满足：

- 新数据库一次性建立采集表和知识库表；
- 已有 `conversations` 数据原样保留；
- 重复初始化无副作用；
- 数据库版本高于当前应用支持版本时安全失败；
- 迁移不得隐式创建知识文档或改变现有对话分类结果。

## 下一里程碑边界

Milestone 3A-1 才实现第一条知识库纵向链路：

```text
conversation event → Inbox source document → edit → virtual collection → search
```

在这条链路通过测试前，不增加 RAG、向量数据库、知识图谱、云同步、自动文件移动
或新的聊天网站。

