import type { ConversationEvent } from "../shared/contracts";
import type { QueueStore } from "./local-store";

export interface EventTransport {
  send(event: ConversationEvent): Promise<"sent" | "duplicate">;
}

export class RetryQueue {
  public constructor(
    private readonly store: QueueStore,
    private readonly maximumSize = 100
  ) {}

  public async enqueue(event: ConversationEvent): Promise<void> {
    const queue = await this.store.getQueue();
    if (queue.some((queued) => queued.event_id === event.event_id)) return;
    const bounded = [...queue, event].slice(-this.maximumSize);
    await this.store.setQueue(bounded);
  }

  public async count(): Promise<number> {
    return (await this.store.getQueue()).length;
  }

  public async retry(transport: EventTransport): Promise<{
    sent: number;
    remaining: number;
  }> {
    const queue = await this.store.getQueue();
    const remaining: ConversationEvent[] = [];
    let sent = 0;
    for (const event of queue) {
      try {
        await transport.send(event);
        sent++;
      } catch {
        remaining.push(event);
      }
    }
    await this.store.setQueue(remaining);
    return { sent, remaining: remaining.length };
  }
}
