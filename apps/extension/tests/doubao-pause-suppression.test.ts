import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { DoubaoAdapter } from "../src/adapters/doubao-adapter";
import {
  findPreviousDoubaoUser,
  getDoubaoAssistantStructure
} from "../src/adapters/doubao-selectors";
import { CompletionDetector } from "../src/content/completion-detector";
import {
  DOUBAO_SUPPRESSED_TURNS_KEY,
  DoubaoSuppressionStore
} from "../src/content/doubao-suppression";
import { SiteCaptureSession } from "../src/content/site-capture-session";
import { TurnProcessor } from "../src/content/turn-processor";
import type { SuppressionStorage } from "../src/content/turn-suppression";
import type { ConversationEvent } from "../src/shared/contracts";

const fixtureDirectory = path.resolve(process.cwd(), "fixtures/doubao");

class MemorySuppressionStorage implements SuppressionStorage {
  public values: Record<string, unknown> = {};

  public async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values[key] };
  }

  public async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }
}

async function loadAdapter(name: string): Promise<DoubaoAdapter> {
  const html = await readFile(path.join(fixtureDirectory, name), "utf8");
  return new DoubaoAdapter(new DOMParser().parseFromString(html, "text/html"));
}

function createSession(
  adapter: DoubaoAdapter,
  storage: MemorySuppressionStorage,
  submitted: ConversationEvent[],
  enabled: () => boolean
): SiteCaptureSession {
  const processor = new TurnProcessor({
    conversationId: adapter.getConversationId(),
    source: "doubao",
    detector: new CompletionDetector(5),
    isEnabled: enabled,
    submit: async (event) => {
      submitted.push(event);
    }
  });
  return new SiteCaptureSession(
    adapter,
    processor,
    new DoubaoSuppressionStore(adapter.getConversationId(), storage)
  );
}

async function waitForStableWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("Doubao pause suppression", () => {
  it("never sends a turn completed while paused after resume", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    const session = createSession(
      await loadAdapter("ordinary-completed.html"), storage, submitted, () => enabled
    );

    await session.scan(false);
    enabled = true;
    await session.scan(true);
    await waitForStableWindow();
    expect(submitted).toHaveLength(0);
  });

  it("suppresses a turn that starts streaming paused and completes resumed", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    await createSession(
      await loadAdapter("streaming-in-progress.html"), storage, submitted, () => enabled
    ).scan(false);

    enabled = true;
    const completed = createSession(
      await loadAdapter("streaming-completed.html"), storage, submitted, () => enabled
    );
    await completed.scan(true);
    await waitForStableWindow();
    expect(submitted).toHaveLength(0);
  });

  it("does not backfill a suppressed turn after refresh or a new content session", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    await createSession(
      await loadAdapter("ordinary-completed.html"), storage, submitted, () => enabled
    ).scan(false);

    enabled = true;
    const refreshed = createSession(
      await loadAdapter("ordinary-completed.html"), storage, submitted, () => enabled
    );
    await refreshed.scan(true);
    await refreshed.scan(true);
    await waitForStableWindow();
    expect(submitted).toHaveLength(0);
  });

  it("captures a genuinely new turn after resume exactly once", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    await createSession(
      await loadAdapter("ordinary-completed.html"), storage, submitted, () => enabled
    ).scan(false);

    enabled = true;
    const adapter = await loadAdapter("ordinary-completed.html");
    const assistantItem = adapter.getTurnElements()[0]!;
    const user = findPreviousDoubaoUser(assistantItem);
    const assistant = getDoubaoAssistantStructure(assistantItem);
    if (user) user.body.textContent = "恢复后提出的全新合成问题";
    if (assistant) assistant.body.textContent = "恢复后生成的全新合成回答";
    const session = createSession(adapter, storage, submitted, () => enabled);
    await session.scan(true);
    await session.scan(true);
    await waitForStableWindow();
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      source: "doubao",
      question: "恢复后提出的全新合成问题",
      answer: "恢复后生成的全新合成回答"
    });
  });

  it("stores only bounded hashed suppression identifiers", async () => {
    const storage = new MemorySuppressionStorage();
    const store = new DoubaoSuppressionStore("doubao-page", storage, 3);
    for (let index = 0; index < 4; index += 1) {
      await store.suppress({
        key: `doubao:turn-${index}`,
        question: `不应持久化的合成问题 ${index}`,
        answer: `不应持久化的合成回答 ${index}`,
        state: "unknown",
        generationId: "initial"
      });
    }
    const stored = storage.values[DOUBAO_SUPPRESSED_TURNS_KEY];
    expect(stored).toEqual(expect.any(Array));
    expect(stored as string[]).toHaveLength(3);
    expect(JSON.stringify(stored)).not.toContain("合成问题");
    expect(JSON.stringify(stored)).not.toContain("合成回答");
  });
});
