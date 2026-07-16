# MockClassifier 当前规则

Milestone 1.5 使用完全确定性的关键词分类器，不调用真实 LLM。分类器按下表从上到
下检查问题和回答拼接后的文本；英文匹配不区分大小写。命中一个学科后即停止，
同一学科内返回最先命中的关键词作为 `topic`。

| 学科 (`subject`) | 支持关键词（按优先顺序） |
| --- | --- |
| `mathematics` | 数学、代数、几何、微积分、概率、方程、函数、矩阵 |
| `computer-science` | 计算机、编程、算法、数据结构、python、javascript、数据库 |
| `physics` | 物理、力学、电磁、热力学、量子、牛顿定律 |
| `chemistry` | 化学、元素周期表、化学反应、有机物、分子、原子 |
| `biology` | 生物、细胞、遗传、基因、生态系统、进化 |
| `history` | 历史、朝代、世界史、中国史、工业革命 |
| `language` | 语文、英语、语法、词汇、阅读理解、写作 |

## 非学习内容

问题和回答均未命中任何上述关键词时，返回：

- `is_learning=false`
- `subject=non-learning`
- `topic=non-learning`
- `confidence=0.1`

该事件仍写入 SQLite，以便按 `event_id` 去重，但不会导出到 Markdown。

## 无法识别时的处理

MockClassifier 不进行语义推断。即使内容实际上与学习有关，只要没有明确关键词，
当前版本仍会把它视为非学习内容；反之，日常文本偶然出现关键词时也可能误判。
这是演示用分类器的已知限制，不应通过添加真实 LLM 在 Milestone 1.5 中解决。
