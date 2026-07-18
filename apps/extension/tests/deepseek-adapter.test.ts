import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekAdapter } from "../src/adapters/deepseek-adapter";
import {
  DEEPSEEK_VIRTUAL_ITEM_SELECTOR,
  getDirectMessageShell
} from "../src/adapters/deepseek-selectors";
import { CompletionDetector } from "../src/content/completion-detector";
import { TurnProcessor } from "../src/content/turn-processor";
import { createConversationEvent } from "../src/shared/event";
import type { ConversationEvent } from "../src/shared/contracts";

const fixtureDirectory = path.resolve(process.cwd(), "fixtures/deepseek");
const syntheticQuestion = "请解释合成测试中的热力学第一定律。";
const syntheticAnswer = "在合成测试中，热力学第一定律表示能量守恒。";

async function loadFixture(name: string): Promise<{ document: Document; adapter: DeepSeekAdapter }> {
  const html = await readFile(path.join(fixtureDirectory, name), "utf8");
  const document = new DOMParser().parseFromString(html, "text/html");
  return { document, adapter: new DeepSeekAdapter(document) };
}

async function processStableSnapshots(
  adapter: DeepSeekAdapter,
  submitted: ConversationEvent[]
): Promise<TurnProcessor> {
  const processor = new TurnProcessor({
    conversationId: adapter.getConversationId(),
    source: "deepseek",
    detector: new CompletionDetector(5),
    isEnabled: () => true,
    submit: async (event) => {
      submitted.push(event);
    }
  });
  for (const element of adapter.getTurnElements()) {
    const snapshot = adapter.extractTurnSnapshot(element);
    if (snapshot) processor.process(snapshot);
  }
  return processor;
}

afterEach(() => vi.restoreAllMocks());

describe("DeepSeekAdapter real sanitized fixtures", () => {
  it("extracts one ordinary question and final answer without operation text", async () => {
    const { adapter } = await loadFixture("ordinary-completed.html");
    const [turn] = adapter.getTurnElements();
    expect(turn).toBeDefined();
    const operationRegion = turn?.children[1];
    operationRegion?.append("DO_NOT_CAPTURE_OPERATION_TEXT");

    const snapshot = turn ? adapter.extractTurnSnapshot(turn) : null;
    expect(snapshot).toMatchObject({
      question: syntheticQuestion,
      answer: syntheticAnswer,
      state: "unknown"
    });
    expect(snapshot?.answer).not.toContain("DO_NOT_CAPTURE_OPERATION_TEXT");
  });

  it("extracts a second independent page after opaque key changes", async () => {
    const { document, adapter } = await loadFixture("ordinary-completed-2.html");
    const items = Array.from(document.querySelectorAll(DEEPSEEK_VIRTUAL_ITEM_SELECTOR));
    items[0]?.setAttribute("data-virtual-list-item-key", "opaque-user-key");
    items[1]?.setAttribute("data-virtual-list-item-key", "opaque-assistant-key");

    const [turn] = adapter.getTurnElements();
    const snapshot = turn ? adapter.extractTurnSnapshot(turn) : null;
    expect(snapshot).toMatchObject({ question: syntheticQuestion, answer: syntheticAnswer });
    expect(snapshot?.key).toBe("deepseek:opaque-assistant-key");
  });

  it("extracts refreshed DOM without retaining old node references", async () => {
    const original = await loadFixture("ordinary-completed-2.html");
    const refreshed = await loadFixture("ordinary-completed-refreshed.html");
    const [originalTurn] = original.adapter.getTurnElements();
    const [refreshedTurn] = refreshed.adapter.getTurnElements();
    expect(originalTurn).not.toBe(refreshedTurn);

    const originalSnapshot = originalTurn
      ? original.adapter.extractTurnSnapshot(originalTurn)
      : null;
    const refreshedSnapshot = refreshedTurn
      ? refreshed.adapter.extractTurnSnapshot(refreshedTurn)
      : null;
    expect(refreshedSnapshot).toMatchObject({
      question: originalSnapshot?.question,
      answer: originalSnapshot?.answer
    });
    const firstEvent = await createConversationEvent({
      source: "deepseek",
      conversationId: original.adapter.getConversationId(),
      question: originalSnapshot?.question ?? "",
      answer: originalSnapshot?.answer ?? ""
    });
    const refreshedEvent = await createConversationEvent({
      source: "deepseek",
      conversationId: refreshed.adapter.getConversationId(),
      question: refreshedSnapshot?.question ?? "",
      answer: refreshedSnapshot?.answer ?? ""
    });
    expect(refreshedEvent.event_id).toBe(firstEvent.event_id);
  });

  it("pairs three rounds in DOM order and ignores a non-message virtual item", async () => {
    const { document, adapter } = await loadFixture("multi-turn.html");
    const assistantItems = adapter.getTurnElements();
    expect(assistantItems).toHaveLength(3);
    assistantItems.forEach((assistantItem, index) => {
      const userItem = assistantItem.previousElementSibling;
      const userShell = userItem ? getDirectMessageShell(userItem) : null;
      const answer = assistantItem.querySelector(".ds-assistant-message-main-content");
      if (userShell?.firstElementChild) {
        userShell.firstElementChild.textContent = `合成问题 ${index + 1}`;
      }
      if (answer) answer.textContent = `合成回答 ${index + 1}`;
    });
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-virtual-list-item-key", "non-message-placeholder");
    assistantItems[1]?.before(placeholder);

    const snapshots = adapter.getTurnElements().map((element) =>
      adapter.extractTurnSnapshot(element)
    );
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((snapshot) => [snapshot?.question, snapshot?.answer])).toEqual([
      ["合成问题 1", "合成回答 1"],
      ["合成问题 2", "合成回答 2"],
      ["合成问题 3", "合成回答 3"]
    ]);
  });

  it("submits three stable rounds once and ignores a repeated scan", async () => {
    const { document, adapter } = await loadFixture("multi-turn.html");
    adapter.getTurnElements().forEach((assistantItem, index) => {
      const userShell = assistantItem.previousElementSibling
        ? getDirectMessageShell(assistantItem.previousElementSibling)
        : null;
      const answer = assistantItem.querySelector(".ds-assistant-message-main-content");
      if (userShell?.firstElementChild) {
        userShell.firstElementChild.textContent = `去重问题 ${index + 1}`;
      }
      if (answer) answer.textContent = `去重回答 ${index + 1}`;
    });
    expect(document.querySelectorAll(DEEPSEEK_VIRTUAL_ITEM_SELECTOR)).toHaveLength(6);
    const submitted: ConversationEvent[] = [];
    const processor = await processStableSnapshots(adapter, submitted);
    await vi.waitFor(() => expect(submitted).toHaveLength(3));

    for (const element of adapter.getTurnElements()) {
      const snapshot = adapter.extractTurnSnapshot(element);
      if (snapshot) processor.process(snapshot);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(submitted).toHaveLength(3);
    expect(new Set(submitted.map((event) => event.event_id)).size).toBe(3);
    expect(submitted.every((event) => event.source === "deepseek")).toBe(true);
  });

  it("does not complete the in-progress streaming fixture", async () => {
    const { adapter } = await loadFixture("streaming-in-progress.html");
    const [turn] = adapter.getTurnElements();
    const snapshot = turn ? adapter.extractTurnSnapshot(turn) : null;
    expect(snapshot?.state).toBe("streaming");
    const submitted: ConversationEvent[] = [];
    await processStableSnapshots(adapter, submitted);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(submitted).toHaveLength(0);
  });

  it("submits the completed streaming fixture once after the stable window", async () => {
    const { adapter } = await loadFixture("streaming-completed.html");
    const [turn] = adapter.getTurnElements();
    expect(turn ? adapter.extractTurnSnapshot(turn)?.state : null).toBe("unknown");
    const submitted: ConversationEvent[] = [];
    const processor = await processStableSnapshots(adapter, submitted);
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    if (turn) {
      const snapshot = adapter.extractTurnSnapshot(turn);
      if (snapshot) processor.process(snapshot);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(submitted).toHaveLength(1);
  });

  it("fails safely for missing, empty, unsupported, and ambiguous structures", () => {
    const cases = [
      "<main></main>",
      `<div data-virtual-list-item-key="assistant"><div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content">answer</div></div><div><div role="button"></div></div></div>`,
      `<div data-virtual-list-item-key="user"><div class="ds-message"><div>question</div></div></div><div data-virtual-list-item-key="assistant"><div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content"></div></div><div><div role="button"></div></div></div>`,
      `<div data-virtual-list-item-key="user"><div class="ds-message"><div>question</div></div></div><div data-virtual-list-item-key="assistant"><div class="ds-message"><div class="reasoning">private reasoning</div><div class="ds-markdown ds-assistant-message-main-content">answer</div></div><div><div role="button"></div></div></div>`,
      `<div data-virtual-list-item-key="user"><div class="ds-message"><div>question</div></div></div><div data-virtual-list-item-key="assistant"><div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content"><a href="#">citation</a></div></div><div><div role="button"></div></div></div>`
    ];
    for (const html of cases) {
      const document = new DOMParser().parseFromString(html, "text/html");
      const adapter = new DeepSeekAdapter(document);
      expect(() => adapter.getTurnElements()).not.toThrow();
      expect(adapter.getTurnElements().map((element) => adapter.extractTurnSnapshot(element)))
        .not.toContainEqual(expect.objectContaining({ state: expect.any(String) }));
    }
  });

  it("uses only reviewed semantic selector constants", async () => {
    const source = (await Promise.all([
      "src/adapters/deepseek-selectors.ts",
      "src/adapters/deepseek-adapter.ts"
    ].map((file) => readFile(path.resolve(process.cwd(), file), "utf8")))).join("\n");
    expect(source).not.toMatch(/fbb737a4|data-virtual-list-item-key\s*=\s*["']?\d/);
    expect(source).not.toMatch(/\.[_a-f0-9]{8}\b|nth-child|transform|getBoundingClientRect/);
    expect(source).not.toMatch(/document\.cookie|localStorage|sessionStorage|XMLHttpRequest|fetch\s*\(/);
  });
});
