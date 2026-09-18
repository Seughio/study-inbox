import type { ConversationAdapter, TurnSnapshot } from "../adapters/types";
import type { TurnSuppressionRegistry } from "./turn-suppression";

export interface TurnConsumer {
  process(snapshot: TurnSnapshot): void;
}

export class SiteCaptureSession {
  public constructor(
    private readonly adapter: ConversationAdapter,
    private readonly consumer: TurnConsumer,
    private readonly suppressed: TurnSuppressionRegistry
  ) {}

  public async scan(enabled: boolean): Promise<void> {
    for (const element of this.adapter.getTurnElements()) {
      const snapshot = this.adapter.extractTurnSnapshot(element);
      if (!snapshot) continue;
      if (!enabled) {
        await this.suppressed.suppress(snapshot);
      } else if (!(await this.suppressed.isSuppressed(snapshot))) {
        this.consumer.process(snapshot);
      }
    }
  }
}
