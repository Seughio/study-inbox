import type { DeepSeekAdapter } from "../adapters/deepseek-adapter";
import type { TurnSnapshot } from "../adapters/types";
import type { DeepSeekSuppressionRegistry } from "./deepseek-suppression";

export interface DeepSeekTurnConsumer {
  process(snapshot: TurnSnapshot): void;
}

export class DeepSeekCaptureSession {
  public constructor(
    private readonly adapter: DeepSeekAdapter,
    private readonly consumer: DeepSeekTurnConsumer,
    private readonly suppressed: DeepSeekSuppressionRegistry
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
