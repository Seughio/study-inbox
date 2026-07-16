import type { ConversationEvent, RuntimeStatus } from "../shared/contracts";
import { LocalApiClient } from "./api-client";
import { ChromeLocalStore } from "../storage/local-store";
import { RetryQueue } from "../storage/retry-queue";

export class BackgroundController {
  public constructor(
    private readonly store = new ChromeLocalStore(),
    private readonly api = new LocalApiClient(),
    private readonly queue = new RetryQueue(store)
  ) {}

  public async submit(
    event: ConversationEvent
  ): Promise<"sent" | "duplicate" | "queued" | "paused"> {
    const state = await this.store.getState();
    if (!state.enabled) return "paused";
    try {
      const outcome = await this.api.send(event);
      await this.store.setSendState(outcome);
      void this.retry();
      return outcome;
    } catch (error) {
      await this.queue.enqueue(event);
      await this.store.setSendState("queued", safeError(error));
      return "queued";
    }
  }

  public async retry(): Promise<{ sent: number; remaining: number }> {
    const result = await this.queue.retry(this.api);
    if (result.sent > 0) {
      await this.store.setSendState(result.remaining ? "queued" : "sent");
    }
    return result;
  }

  public async getStatus(): Promise<RuntimeStatus> {
    const [state, serviceOnline, retryCount] = await Promise.all([
      this.store.getState(),
      this.api.isOnline(),
      this.queue.count()
    ]);
    return { ...state, serviceOnline, retryCount };
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await this.store.setEnabled(enabled);
  }
}

function safeError(error: unknown): string {
  if (error instanceof TypeError) return "local service unavailable";
  if (error instanceof Error) return error.message.slice(0, 120);
  return "local service error";
}
