import { describe, expect, it, vi } from "vitest";
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
    expect(store.state.lastSendStatus).toBe("queued");
    expect(store.state.lastError).toBe("local service unavailable");
  });

  it("queues retryable local API errors and deduplicates repeated failures", async () => {
    const store = new TestStore();
    const api = {
      send: vi.fn(async () => { throw new Error("local API returned 503"); }),
      isOnline: async () => false
    };
    const controller = new BackgroundController(store, api, new RetryQueue(store));
    expect(await controller.submit(event)).toBe("queued");
    expect(await controller.submit(event)).toBe("queued");
    expect(store.queue).toEqual([event]);
    expect(store.state).toMatchObject({
      lastSendStatus: "queued",
      lastError: "local API returned 503"
    });
  });

  it("does not queue a successful send and clears the previous error", async () => {
    const store = new TestStore();
    store.state.lastError = "old error";
    const api = {
      send: async () => "sent" as const,
      isOnline: async () => true
    };
    const controller = new BackgroundController(store, api, new RetryQueue(store));
    expect(await controller.submit(event)).toBe("sent");
    expect(store.queue).toEqual([]);
    expect(store.state.lastSendStatus).toBe("sent");
    expect(store.state.lastError).toBeUndefined();
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

  it("keeps queued status on failed retry and clears it only after success", async () => {
    const store = new TestStore();
    store.queue = [event];
    store.state = {
      enabled: true,
      lastSendStatus: "sent",
      lastError: "old error"
    };
    let online = false;
    const api = {
      send: async () => {
        if (!online) throw new TypeError("fetch failed");
        return "sent" as const;
      },
      isOnline: async () => online
    };
    const controller = new BackgroundController(store, api, new RetryQueue(store));

    expect(await controller.retry()).toEqual({ sent: 0, remaining: 1 });
    expect(store.queue).toEqual([event]);
    expect(store.state).toMatchObject({
      lastSendStatus: "queued",
      lastError: "local service unavailable"
    });

    online = true;
    expect(await controller.retry()).toEqual({ sent: 1, remaining: 0 });
    expect(store.queue).toEqual([]);
    expect(store.state.lastSendStatus).toBe("sent");
    expect(store.state.lastError).toBeUndefined();
  });
});
