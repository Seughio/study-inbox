(() => {
  const conversation = document.querySelector("#conversation");
  const status = document.querySelector("#fixture-status");
  let sequence = 0;

  const synthetic = {
    learning: {
      question: "请解释数学中函数的定义。",
      answer: "函数描述一个集合中的每个输入如何唯一对应到另一个集合中的输出。"
    },
    nonLearning: {
      question: "今天午餐如何搭配？",
      answer: "可以按个人口味选择主食、蔬菜和蛋白质。"
    },
    streaming: {
      question: "请解释物理中的热力学第一定律。",
      chunks: ["热力学第一定律说明", "能量守恒。", "系统内能变化等于热量与做功之和。"]
    }
  };

  function createTurn({ question, answer = "", reasoning = "", state = "complete", turnId, generation = "1", className = "" }) {
    const article = document.createElement("article");
    article.dataset.fixtureTurn = "";
    article.dataset.turnId = turnId || `turn-${++sequence}`;
    article.dataset.state = state;
    article.dataset.generationId = generation;
    article.className = className;
    const user = document.createElement("div");
    user.dataset.role = "user";
    user.textContent = question;
    article.append(user);
    if (reasoning) {
      const thought = document.createElement("div");
      thought.dataset.role = "reasoning";
      thought.textContent = reasoning;
      article.append(thought);
    }
    const final = document.createElement("div");
    final.dataset.role = "final-answer";
    final.textContent = answer;
    article.append(final);
    conversation.append(article);
    return article;
  }

  function streamTurn(turn, chunks, delay = 250) {
    const answer = turn.querySelector('[data-role="final-answer"]');
    turn.dataset.state = "streaming";
    answer.textContent = "";
    let index = 0;
    const timer = setInterval(() => {
      answer.textContent += chunks[index++];
      if (index === chunks.length) {
        clearInterval(timer);
        turn.dataset.state = "complete";
        status.textContent = "流式回答已完成";
      }
    }, delay);
  }

  const actions = {
    learning: () => createTurn({ ...synthetic.learning, className: "regeneratable" }),
    "non-learning": () => createTurn(synthetic.nonLearning),
    multi: () => {
      createTurn({ question: "数学中的矩阵是什么？", answer: "矩阵是按行和列排列的数表。" });
      createTurn({ question: "矩阵乘法需要满足什么条件？", answer: "前一个矩阵的列数需要等于后一个矩阵的行数。" });
    },
    streaming: () => {
      const turn = createTurn({ question: synthetic.streaming.question, state: "streaming", className: "regeneratable" });
      streamTurn(turn, synthetic.streaming.chunks);
    },
    reasoning: () => createTurn({
      question: "物理中如何区分速度和速率？",
      reasoning: "先比较两个概念是否包含方向信息。",
      answer: "速度是矢量并包含方向，速率是标量。"
    }),
    code: () => {
      const turn = createTurn({ question: "用 Python 编程计算列表总和。", answer: "" });
      const final = turn.querySelector('[data-role="final-answer"]');
      final.innerHTML = "<p>可以使用内置函数：</p><pre><code>values = [1, 2, 3]\nprint(sum(values))</code></pre>";
    },
    table: () => createTurn({
      question: "用 Markdown 表格比较数学中的函数类型。",
      answer: "| 类型 | 特点 |\n| --- | --- |\n| 线性函数 | 变化率固定 |\n| 二次函数 | 图像为抛物线 |"
    }),
    irrelevant: () => {
      const turn = createTurn(synthetic.learning);
      setTimeout(() => {
        const controls = document.createElement("div");
        controls.className = "actions";
        controls.textContent = "复制  点赞  分享";
        turn.append(controls);
      }, 500);
    },
    regenerate: () => {
      const turn = conversation.querySelector(".regeneratable:last-of-type") || actions.learning();
      const next = String(Number(turn.dataset.generationId || "1") + 1);
      turn.dataset.generationId = next;
      streamTurn(turn, ["函数也可以理解为", "稳定的输入输出映射关系。"]);
    },
    empty: () => createTurn({ question: "这是空回答测试。", answer: "", state: "complete" }),
    incomplete: () => {
      const node = document.createElement("article");
      node.dataset.fixtureTurn = "";
      node.dataset.turnId = `turn-${++sequence}`;
      node.dataset.state = "complete";
      node.textContent = "缺少用户问题和最终回答结构";
      conversation.append(node);
    },
    reload: () => {
      localStorage.setItem("study-inbox-reload-fixture", "1");
      location.reload();
    }
  };

  document.querySelector("nav").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-scenario]");
    if (!button) return;
    status.textContent = `正在执行：${button.textContent}`;
    actions[button.dataset.scenario]();
  });

  if (localStorage.getItem("study-inbox-reload-fixture") === "1") {
    localStorage.removeItem("study-inbox-reload-fixture");
    createTurn({ ...synthetic.learning, turnId: "stable-reload-turn" });
    status.textContent = "已在刷新后重新加载同一轮问答";
  }
})();
