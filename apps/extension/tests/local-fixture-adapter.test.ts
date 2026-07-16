import { beforeEach, describe, expect, it } from "vitest";
import { LocalFixtureAdapter } from "../src/adapters/local-fixture-adapter";

function addTurn(
  id: string,
  question: string,
  answer: string,
  options: { state?: string; reasoning?: string; answerHtml?: string } = {}
): Element {
  const turn = document.createElement("article");
  turn.dataset.fixtureTurn = "";
  turn.dataset.turnId = id;
  turn.dataset.generationId = "1";
  if (options.state) turn.dataset.state = options.state;
  turn.innerHTML = `<div data-role="user">${question}</div>`;
  if (options.reasoning) {
    turn.innerHTML += `<div data-role="reasoning">${options.reasoning}</div>`;
  }
  turn.innerHTML += `<div data-role="final-answer">${options.answerHtml ?? answer}</div>`;
  document.body.append(turn);
  return turn;
}

describe("LocalFixtureAdapter", () => {
  beforeEach(() => {
    document.documentElement.setAttribute("data-study-inbox-fixture", "");
    document.body.innerHTML = "";
    document.body.dataset.conversationId = "fixture-conversation";
  });

  it("pairs a normal question and answer", () => {
    const turn = addTurn("one", "数学问题", "函数回答", { state: "complete" });
    const result = new LocalFixtureAdapter(document).extractCompletedTurn(turn);
    expect(result).toMatchObject({ question: "数学问题", answer: "函数回答" });
  });

  it("pairs multiple turns independently", () => {
    addTurn("one", "问题一", "回答一", { state: "complete" });
    addTurn("two", "问题二", "回答二", { state: "complete" });
    const adapter = new LocalFixtureAdapter(document);
    expect(adapter.getTurnElements().map((turn) => adapter.extractTurnSnapshot(turn)?.key))
      .toEqual(["one", "two"]);
  });

  it("excludes reasoning and keeps only the final answer", () => {
    const turn = addTurn("reasoning", "物理问题", "最终答案", {
      state: "complete",
      reasoning: "内部推理内容"
    });
    const result = new LocalFixtureAdapter(document).extractCompletedTurn(turn);
    expect(result?.answer).toBe("最终答案");
    expect(result?.reasoning).toBe("内部推理内容");
    expect(result?.answer).not.toContain("内部推理");
  });

  it("preserves code block text and line breaks", () => {
    const turn = addTurn("code", "Python 编程", "", {
      state: "complete",
      answerHtml: "<pre><code>value = 1\nprint(value)</code></pre>"
    });
    expect(new LocalFixtureAdapter(document).extractCompletedTurn(turn)?.answer)
      .toContain("print(value)");
  });

  it("fails safely for empty answers and incomplete structures", () => {
    const empty = addTurn("empty", "问题", "", { state: "complete" });
    const incomplete = document.createElement("article");
    incomplete.dataset.fixtureTurn = "";
    document.body.append(incomplete);
    const adapter = new LocalFixtureAdapter(document);
    expect(adapter.extractCompletedTurn(empty)).toBeNull();
    expect(adapter.extractTurnSnapshot(incomplete)).toBeNull();
  });
});
