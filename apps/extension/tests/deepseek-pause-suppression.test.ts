import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepSeekAdapter } from "../src/adapters/deepseek-adapter";
import type { TurnSnapshot } from "../src/adapters/types";
import { CompletionDetector } from "../src/content/completion-detector";
import { DeepSeekCaptureSession } from "../src/content/deepseek-capture-session";
import {
  DEEPSEEK_SUPPRESSED_TURNS_KEY,
  DeepSeekSuppressionStore,
  type SuppressionStorage
} from "../src/content/deepseek-suppression";
import { TurnProcessor } from "../src/content/turn-processor";
import type { ConversationEvent } from "../src/shared/contracts";

const fixtureDirectory = path.resolve(process.cwd(), "fixtures/deepseek");

class MemorySuppressionStorage implements SuppressionStorage {
  public values: Record<string, unknown> = {};

  public async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.values[key] };
  }

  public async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.values, items);
  }
}

async function loadAdapter(name: string): Promise<DeepSeekAdapter> {
  const html = await readFile(path.join(fixtureDirectory, name), "utf8");
  return new DeepSeekAdapter(new DOMParser().parseFromString(html, "text/html"));
}

function createSession(
  adapter: DeepSeekAdapter,
  storage: MemorySuppressionStorage,
  submitted: ConversationEvent[],
  enabled: () => boolean
): DeepSeekCaptureSession {
  const processor = new TurnProcessor({
    conversationId: adapter.getConversationId(),
    source: "deepseek",
    detector: new CompletionDetector(5),
    isEnabled: enabled,
    submit: async (event) => {
      submitted.push(event);
    }
  });
  return new DeepSeekCaptureSession(
    adapter,
    processor,
    new DeepSeekSuppressionStore(adapter.getConversationId(), storage)
  );
}

async function waitForStableWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

afterEach(() => vi.restoreAllMocks());

describe("DeepSeek pause suppression", () => {
  it("does not send a turn completed while paused or backfill it after resume", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    const session = createSession(
      await loadAdapter("ordinary-completed.html"),
      storage,
      submitted,
      () => enabled
    );

    await session.scan(false);
    enabled = true;
    await session.scan(true);
    await waitForStableWindow();

    expect(submitted).toHaveLength(0);
  });

  it("keeps a turn suppressed when streaming starts paused and completes resumed", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    const streaming = createSession(
      await loadAdapter("streaming-in-progress.html"),
      storage,
      submitted,
      () => enabled
    );
    await streaming.scan(false);

    enabled = true;
    const completed = createSession(
      await loadAdapter("streaming-completed.html"),
      storage,
      submitted,
      () => enabled
    );
    await completed.scan(true);
    await waitForStableWindow();

    expect(submitted).toHaveLength(0);
  });

  it("captures a new turn after resume exactly once", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    const oldSession = createSession(
      await loadAdapter("ordinary-completed.html"),
      storage,
      submitted,
      () => enabled
    );
    await oldSession.scan(false);

    enabled = true;
    const document = new DOMParser().parseFromString(`
      <div data-virtual-list-item-key="new-user"><div class="ds-message"><div>新的合成问题</div></div></div>
      <div data-virtual-list-item-key="new-assistant">
        <div class="ds-message"><div class="ds-markdown ds-assistant-message-main-content">新的合成回答</div></div>
        <div><div role="button"></div></div>
      </div>
    `, "text/html");
    const newSession = createSession(
      new DeepSeekAdapter(document), storage, submitted, () => enabled
    );
    await newSession.scan(true);
    await newSession.scan(true);
    await waitForStableWindow();

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      question: "新的合成问题",
      answer: "新的合成回答"
    });
  });

  it("does not backfill a suppressed completed turn after page refresh", async () => {
    const storage = new MemorySuppressionStorage();
    const submitted: ConversationEvent[] = [];
    let enabled = false;
    await createSession(
      await loadAdapter("ordinary-completed-2.html"), storage, submitted, () => enabled
    ).scan(false);

    enabled = true;
    const refreshed = createSession(
      await loadAdapter("ordinary-completed-refreshed.html"),
      storage,
      submitted,
      () => enabled
    );
    await refreshed.scan(true);
    await refreshed.scan(true);
    await waitForStableWindow();

    expect(submitted).toHaveLength(0);
  });

  it("bounds persisted identifiers and never stores conversation text", async () => {
    const storage = new MemorySuppressionStorage();
    const store = new DeepSeekSuppressionStore("deepseek-page", storage, 4);
    for (let index = 0; index < 5; index += 1) {
      const snapshot: TurnSnapshot = {
        key: `deepseek:turn-${index}`,
        question: `隐私问题 ${index}`,
        answer: `隐私回答 ${index}`,
        state: "unknown",
        generationId: "initial"
      };
      await store.suppress(snapshot);
    }

    const stored = storage.values[DEEPSEEK_SUPPRESSED_TURNS_KEY];
    expect(stored).toEqual(expect.any(Array));
    expect((stored as string[])).toHaveLength(4);
    expect(JSON.stringify(stored)).not.toContain("隐私问题");
    expect(JSON.stringify(stored)).not.toContain("隐私回答");
  });

  it("does not suppress a later completed turn with a reused key but new answer", async () => {
    const storage = new MemorySuppressionStorage();
    const store = new DeepSeekSuppressionStore("deepseek-page", storage);
    const paused: TurnSnapshot = {
      key: "deepseek:reused-key",
      question: "可重复提出的合成问题",
      answer: "暂停期间的合成回答",
      state: "unknown",
      generationId: "initial"
    };
    await store.suppress(paused);

    expect(await store.isSuppressed({
      ...paused,
      answer: "恢复之后的新合成回答"
    })).toBe(false);
  });
});
