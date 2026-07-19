import { describe, expect, it, vi } from "vitest";
import type { ConversationEvent } from "../src/shared/contracts";
import type { QueueStore } from "../src/storage/local-store";
import { RetryQueue } from "../src/storage/retry-queue";

class MemoryStore implements QueueStore {
  public queue: ConversationEvent[] = [];
  public async getQueue(): Promise<ConversationEvent[]> { return [...this.queue]; }
  public async setQueue(queue: ConversationEvent[]): Promise<void> { this.queue = [...queue]; }
}

function event(index: number): ConversationEvent {
  return {
    event_id: `event-${index}`,
    source: "local-fixture",
    conversation_id: "queue-test",
    question: `数学问题 ${index}`,
    answer: "函数回答",
    captured_at: "2026-01-01T00:00:00Z"
  };
}

describe("RetryQueue", () => {
  it("deduplicates queued events", async () => {
    const store = new MemoryStore();
    const queue = new RetryQueue(store);
    await queue.enqueue(event(1));
    await queue.enqueue(event(1));
    expect(await queue.count()).toBe(1);
  });

  it("queues offline events and retries them after recovery", async () => {
    const store = new MemoryStore();
    const queue = new RetryQueue(store);
    await queue.enqueue(event(1));
    const send = vi.fn(async () => "sent" as const);
    expect(await queue.retry({ send })).toEqual({ sent: 1, remaining: 0 });
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps failed events for a later retry", async () => {
    const store = new MemoryStore();
    const queue = new RetryQueue(store);
    await queue.enqueue(event(1));
    await queue.retry({ send: async () => { throw new Error("offline"); } });
    expect(await queue.count()).toBe(1);
  });

  it("removes an event only after a successful retry", async () => {
    const store = new MemoryStore();
    const queue = new RetryQueue(store);
    await queue.enqueue(event(1));
    await queue.retry({ send: async () => { throw new Error("offline"); } });
    expect(store.queue).toEqual([event(1)]);
    await queue.retry({ send: async () => "duplicate" as const });
    expect(store.queue).toEqual([]);
  });

  it("does not overwrite an event enqueued while a retry is in progress", async () => {
    const store = new MemoryStore();
    const queue = new RetryQueue(store);
    await queue.enqueue(event(1));
    let releaseSend: (() => void) | undefined;
    const sendBlocked = new Promise<void>((resolve) => { releaseSend = resolve; });
    const retrying = queue.retry({
      send: async () => {
        await sendBlocked;
        return "sent" as const;
      }
    });
    await vi.waitFor(() => expect(releaseSend).toBeDefined());
    const enqueuing = queue.enqueue(event(2));
    releaseSend?.();
    await Promise.all([retrying, enqueuing]);
    expect(store.queue).toEqual([event(2)]);
  });

  it("never grows beyond its configured maximum", async () => {
    const store = new MemoryStore();
    const queue = new RetryQueue(store, 3);
    for (let index = 0; index < 5; index++) await queue.enqueue(event(index));
    expect(store.queue.map((item) => item.event_id)).toEqual([
      "event-2", "event-3", "event-4"
    ]);
  });
});
