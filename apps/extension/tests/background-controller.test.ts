import { describe, expect, it } from "vitest";
import { BackgroundController } from "../src/background/controller";
import type {
  ConversationEvent,
  ExtensionState
} from "../src/shared/contracts";
import { RetryQueue } from "../src/storage/retry-queue";

class TestStore {
  public queue: ConversationEvent[] = [];
  public state: ExtensionState = { enabled: true, lastSendStatus: "never" };
  public async getQueue(): Promise<ConversationEvent[]> { return [...this.queue]; }
  public async setQueue(queue: ConversationEvent[]): Promise<void> { this.queue = queue; }
  public async getState(): Promise<ExtensionState> { return { ...this.state }; }
  public async setEnabled(enabled: boolean): Promise<void> { this.state.enabled = enabled; }
  public async setSendState(
    status: ExtensionState["lastSendStatus"], error?: string
  ): Promise<void> {
    this.state.lastSendStatus = status;
    this.state.lastError = error;
  }
}

const event: ConversationEvent = {
  event_id: "offline-event",
  source: "local-fixture",
  conversation_id: "background-test",
  question: "数学问题",
  answer: "函数回答",
  captured_at: "2026-01-01T00:00:00Z"
};

describe("BackgroundController", () => {
  it("puts an event in the retry queue when the API is offline", async () => {
    const store = new TestStore();
    const api = {
      send: async () => { throw new TypeError("fetch failed"); },
      isOnline: async () => false
    };
    const controller = new BackgroundController(store, api, new RetryQueue(store));
    expect(await controller.submit(event)).toBe("queued");
    expect(store.queue).toEqual([event]);
    expect(store.state.lastError).toBe("local service unavailable");
  });

  it("does not send or queue while paused", async () => {
    const store = new TestStore();
    store.state.enabled = false;
    let called = false;
    const api = {
      send: async () => { called = true; return "sent" as const; },
      isOnline: async () => true
    };
    const controller = new BackgroundController(store, api, new RetryQueue(store));
    expect(await controller.submit(event)).toBe("paused");
    expect(called).toBe(false);
    expect(store.queue).toEqual([]);
  });
});
