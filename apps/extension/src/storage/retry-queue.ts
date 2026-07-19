import type { ConversationEvent } from "../shared/contracts";
import type { QueueStore } from "./local-store";

export interface EventTransport {
  send(event: ConversationEvent): Promise<"sent" | "duplicate">;
}

export class RetryQueue {
  private operations: Promise<void> = Promise.resolve();

  public constructor(
    private readonly store: QueueStore,
    private readonly maximumSize = 100
  ) {}

  public async enqueue(event: ConversationEvent): Promise<void> {
    await this.exclusive(async () => {
      const queue = await this.store.getQueue();
      if (queue.some((queued) => queued.event_id === event.event_id)) return;
      const bounded = [...queue, event].slice(-this.maximumSize);
      await this.store.setQueue(bounded);
    });
  }

  public async count(): Promise<number> {
    return this.exclusive(async () => (await this.store.getQueue()).length);
  }

  public async retry(transport: EventTransport): Promise<{
    sent: number;
    remaining: number;
  }> {
    return this.exclusive(async () => {
      const queue = await this.store.getQueue();
      const sentIds = new Set<string>();
      for (const event of queue) {
        try {
          await transport.send(event);
          sentIds.add(event.event_id);
        } catch {
          // Failed events remain in the persisted queue.
        }
      }
      const latestQueue = await this.store.getQueue();
      const remaining = latestQueue.filter((event) => !sentIds.has(event.event_id));
      await this.store.setQueue(remaining);
      return { sent: sentIds.size, remaining: remaining.length };
    });
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }
}
