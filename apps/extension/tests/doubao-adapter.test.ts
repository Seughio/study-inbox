import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { DoubaoAdapter } from "../src/adapters/doubao-adapter";
import {
  DOUBAO_MESSAGE_ITEM_SELECTOR,
  findPreviousDoubaoUser,
  getDoubaoAssistantStructure,
  getDoubaoMessageItems,
  getDoubaoUserStructure
} from "../src/adapters/doubao-selectors";
import { CompletionDetector } from "../src/content/completion-detector";
import { TurnProcessor } from "../src/content/turn-processor";
import type { ConversationEvent } from "../src/shared/contracts";
import { createConversationEvent } from "../src/shared/event";

const fixtureDirectory = path.resolve(process.cwd(), "fixtures/doubao");
const syntheticQuestion = "请解释合成测试中的热力学第一定律。";
const syntheticAnswer = "在合成测试中，热力学第一定律表示能量守恒。";

async function loadFixture(name: string): Promise<{ document: Document; adapter: DoubaoAdapter }> {
  const html = await readFile(path.join(fixtureDirectory, name), "utf8");
  const document = new DOMParser().parseFromString(html, "text/html");
  return { document, adapter: new DoubaoAdapter(document) };
}

function createProcessor(adapter: DoubaoAdapter, submitted: ConversationEvent[]): TurnProcessor {
  return new TurnProcessor({
    conversationId: adapter.getConversationId(),
    source: "doubao",
    detector: new CompletionDetector(5),
    isEnabled: () => true,
    submit: async (event) => {
      submitted.push(event);
    }
  });
}

function scan(adapter: DoubaoAdapter, processor: TurnProcessor): void {
  for (const element of adapter.getTurnElements()) {
    const snapshot = adapter.extractTurnSnapshot(element);
    if (snapshot) processor.process(snapshot);
  }
}

async function waitForStableWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

afterEach(() => vi.restoreAllMocks());

describe("DoubaoAdapter real sanitized fixtures", () => {
  it("handles only the confirmed ordinary conversation URL shape", () => {
    const adapter = new DoubaoAdapter(document);
    expect(adapter.canHandle(new URL("https://www.doubao.com/chat/synthetic-id"))).toBe(true);
    expect(adapter.canHandle(new URL("https://www.doubao.com/chat/synthetic-id?from=test"))).toBe(true);
    expect(adapter.canHandle(new URL("https://www.doubao.com/"))).toBe(false);
    expect(adapter.canHandle(new URL("https://www.doubao.com/chat/"))).toBe(false);
    expect(adapter.canHandle(new URL("https://www.doubao.com/chat/synthetic-id#route"))).toBe(false);
    expect(adapter.canHandle(new URL("https://sub.doubao.com/chat/synthetic-id"))).toBe(false);
    expect(adapter.canHandle(new URL("https://example.com/chat/synthetic-id"))).toBe(false);
  });

  it("extracts one ordinary turn without operation button text and submits it once", async () => {
    const { document, adapter } = await loadFixture("ordinary-completed.html");
    const [turn] = adapter.getTurnElements();
    expect(turn).toBeDefined();
    document.querySelector('[data-foundation-type="receive-message-action-bar"]')
      ?.append("DO_NOT_CAPTURE_OPERATION_TEXT");

    const snapshot = turn ? adapter.extractTurnSnapshot(turn) : null;
    expect(snapshot).toMatchObject({
      question: syntheticQuestion,
      answer: syntheticAnswer,
      state: "unknown"
    });
    expect(snapshot?.answer).not.toContain("DO_NOT_CAPTURE_OPERATION_TEXT");

    const submitted: ConversationEvent[] = [];
    const processor = createProcessor(adapter, submitted);
    scan(adapter, processor);
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    scan(adapter, processor);
    await waitForStableWindow();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.source).toBe("doubao");
  });

  it("pairs three distinct rounds in DOM order and ignores a non-message item", async () => {
    const { document, adapter } = await loadFixture("multi-turn.html");
    const assistantItems = adapter.getTurnElements();
    expect(assistantItems).toHaveLength(3);
    assistantItems.forEach((assistantItem, index) => {
      const user = findPreviousDoubaoUser(assistantItem);
      const assistant = getDoubaoAssistantStructure(assistantItem);
      if (user) user.body.textContent = `不同的合成问题 ${index + 1}`;
      if (assistant) assistant.body.textContent = `不同的合成回答 ${index + 1}`;
    });
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-target-id", "message-box-target-id");
    assistantItems[1]?.before(placeholder);

    const snapshots = adapter.getTurnElements().map((element) =>
      adapter.extractTurnSnapshot(element)
    );
    expect(snapshots).toHaveLength(3);
    expect(snapshots.map((snapshot) => [snapshot?.question, snapshot?.answer])).toEqual([
      ["不同的合成问题 1", "不同的合成回答 1"],
      ["不同的合成问题 2", "不同的合成回答 2"],
      ["不同的合成问题 3", "不同的合成回答 3"]
    ]);

    const submitted: ConversationEvent[] = [];
    const processor = createProcessor(adapter, submitted);
    scan(adapter, processor);
    await vi.waitFor(() => expect(submitted).toHaveLength(3));
    scan(adapter, processor);
    await waitForStableWindow();
    expect(submitted).toHaveLength(3);
    expect(new Set(submitted.map((event) => event.event_id)).size).toBe(3);
  });

  it("does not submit while the assistant body is streaming", async () => {
    const { adapter } = await loadFixture("streaming-in-progress.html");
    const [turn] = adapter.getTurnElements();
    expect(turn ? adapter.extractTurnSnapshot(turn)?.state : null).toBe("streaming");
    const submitted: ConversationEvent[] = [];
    const processor = createProcessor(adapter, submitted);
    scan(adapter, processor);
    await waitForStableWindow();
    expect(submitted).toHaveLength(0);
  });

  it("submits a completed streaming answer once after the stable window", async () => {
    const { adapter } = await loadFixture("streaming-completed.html");
    const [turn] = adapter.getTurnElements();
    expect(turn ? adapter.extractTurnSnapshot(turn)?.state : null).toBe("unknown");
    const submitted: ConversationEvent[] = [];
    const processor = createProcessor(adapter, submitted);
    scan(adapter, processor);
    await vi.waitFor(() => expect(submitted).toHaveLength(1));
    scan(adapter, processor);
    await waitForStableWindow();
    expect(submitted).toHaveLength(1);
  });

  it("produces the same event id after a page refresh", async () => {
    const first = await loadFixture("ordinary-completed.html");
    const refreshed = await loadFixture("ordinary-completed.html");
    const firstElement = first.adapter.getTurnElements()[0];
    const refreshedElement = refreshed.adapter.getTurnElements()[0];
    const firstSnapshot = firstElement ? first.adapter.extractTurnSnapshot(firstElement) : null;
    const refreshedSnapshot = refreshedElement
      ? refreshed.adapter.extractTurnSnapshot(refreshedElement)
      : null;
    const firstEvent = await createConversationEvent({
      source: "doubao",
      conversationId: first.adapter.getConversationId(),
      question: firstSnapshot?.question ?? "",
      answer: firstSnapshot?.answer ?? ""
    });
    const refreshedEvent = await createConversationEvent({
      source: "doubao",
      conversationId: refreshed.adapter.getConversationId(),
      question: refreshedSnapshot?.question ?? "",
      answer: refreshedSnapshot?.answer ?? ""
    });
    expect(refreshedEvent.event_id).toBe(firstEvent.event_id);
  });

  it("fails safely for missing, empty, ambiguous, and unsupported structures", async () => {
    const missingUser = await loadFixture("ordinary-completed.html");
    getDoubaoUserStructure(getDoubaoMessageItems(missingUser.document)[0]!)?.body.remove();

    const missingAssistant = await loadFixture("ordinary-completed.html");
    getDoubaoAssistantStructure(missingAssistant.adapter.getTurnElements()[0]!)?.body.remove();

    const emptyAnswer = await loadFixture("ordinary-completed.html");
    getDoubaoAssistantStructure(emptyAnswer.adapter.getTurnElements()[0]!)!.body.textContent = " ";

    const versions = await loadFixture("ordinary-completed.html");
    const assistantItem = versions.adapter.getTurnElements()[0]!;
    const assistantRow = assistantItem.closest(".v_list_row")!;
    assistantRow.after(assistantRow.cloneNode(true));

    const missingCompletionActions = await loadFixture("ordinary-completed.html");
    const completionBar = missingCompletionActions.document.querySelector(
      '[data-foundation-type="receive-message-action-bar"]'
    );
    completionBar?.querySelectorAll("button, [role='button']").forEach((button) => button.remove());

    for (const candidate of [
      missingUser,
      missingAssistant,
      emptyAnswer,
      versions,
      missingCompletionActions
    ]) {
      expect(() => candidate.adapter.getTurnElements()).not.toThrow();
      const snapshots = candidate.adapter.getTurnElements().map((element) =>
        candidate.adapter.extractTurnSnapshot(element)
      );
      expect(snapshots.filter(Boolean)).toHaveLength(0);
    }

    for (const tagName of ["a", "pre", "code", "table", "img", "audio"]) {
      const candidate = await loadFixture("ordinary-completed.html");
      const turn = candidate.adapter.getTurnElements()[0]!;
      getDoubaoAssistantStructure(turn)?.body.append(candidate.document.createElement(tagName));
      expect(candidate.adapter.getTurnElements()).toHaveLength(0);
    }

    const unknownPlugin = await loadFixture("ordinary-completed.html");
    const unknownTurn = unknownPlugin.adapter.getTurnElements()[0]!;
    const card = unknownPlugin.document.createElement("div");
    card.setAttribute("data-plugin-identifier", "complex-card");
    unknownTurn.append(card);
    expect(unknownPlugin.adapter.getTurnElements()).toHaveLength(0);

    const blank = new DoubaoAdapter(new DOMParser().parseFromString("<main></main>", "text/html"));
    expect(() => blank.getTurnElements()).not.toThrow();
    expect(blank.getTurnElements()).toEqual([]);
  });

  it("keeps all DOM rules centralized and avoids prohibited dependencies", async () => {
    const source = (await Promise.all([
      "src/adapters/doubao-selectors.ts",
      "src/adapters/doubao-adapter.ts"
    ].map((file) => readFile(path.resolve(process.cwd(), file), "utf8")))).join("\n");
    expect(source).not.toMatch(/synthetic-message-\d|synthetic-observe-row-\d/);
    expect(source).not.toMatch(/getAttribute\(["']data-(?:message-id|observe-row)["']\)/);
    expect(source).not.toMatch(/nth-child|nth-of-type|transform|getBoundingClientRect|innerHTML/);
    expect(source).not.toMatch(/document\.cookie|localStorage|sessionStorage|XMLHttpRequest|fetch\s*\(/);
    expect(source).not.toMatch(/container-[A-Za-z0-9]{6}|content-[A-Za-z0-9]{6}|inner-item-/);
    expect(source).toContain(DOUBAO_MESSAGE_ITEM_SELECTOR);
  });
});
