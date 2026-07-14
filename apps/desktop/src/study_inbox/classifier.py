from __future__ import annotations

import re
from dataclasses import dataclass

from study_inbox.models import Classification, ConversationEvent


@dataclass(frozen=True)
class CourseRule:
    subject: str
    topic: str
    keywords: tuple[str, ...]


class MockClassifier:
    """A deterministic classifier used until a real classifier is requested."""

    _rules = (
        CourseRule(
            "mathematics",
            "mathematics",
            ("数学", "代数", "几何", "微积分", "概率", "方程", "函数", "矩阵"),
        ),
        CourseRule(
            "computer-science",
            "computer science",
            ("计算机", "编程", "算法", "数据结构", "python", "javascript", "数据库"),
        ),
        CourseRule(
            "physics",
            "physics",
            ("物理", "力学", "电磁", "热力学", "量子", "牛顿定律"),
        ),
        CourseRule(
            "chemistry",
            "chemistry",
            ("化学", "元素周期表", "化学反应", "有机物", "分子", "原子"),
        ),
        CourseRule(
            "biology",
            "biology",
            ("生物", "细胞", "遗传", "基因", "生态系统", "进化"),
        ),
        CourseRule(
            "history",
            "history",
            ("历史", "朝代", "世界史", "中国史", "工业革命"),
        ),
        CourseRule(
            "language",
            "language learning",
            ("语文", "英语", "语法", "词汇", "阅读理解", "写作"),
        ),
    )

    def classify(self, event: ConversationEvent) -> Classification:
        searchable = f"{event.question}\n{event.answer}".casefold()
        normalized_question = self._normalize(event.question)
        answer_summary = self._summarize(event.answer)

        for rule in self._rules:
            matched_keyword = next(
                (keyword for keyword in rule.keywords if keyword in searchable), None
            )
            if matched_keyword is not None:
                return Classification(
                    is_learning=True,
                    subject=rule.subject,
                    topic=matched_keyword,
                    normalized_question=normalized_question,
                    answer_summary=answer_summary,
                    confidence=0.95,
                )

        return Classification(
            is_learning=False,
            subject="non-learning",
            topic="non-learning",
            normalized_question=normalized_question,
            answer_summary=answer_summary,
            confidence=0.1,
        )

    @staticmethod
    def _normalize(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    @classmethod
    def _summarize(cls, value: str) -> str:
        normalized = cls._normalize(value)
        if len(normalized) <= 200:
            return normalized
        return f"{normalized[:197]}..."
