import type { DeepSeekAdapter } from "../adapters/deepseek-adapter";
import { SiteCaptureSession, type TurnConsumer } from "./site-capture-session";
import type { DeepSeekSuppressionRegistry } from "./deepseek-suppression";

export type DeepSeekTurnConsumer = TurnConsumer;

export class DeepSeekCaptureSession extends SiteCaptureSession {
  public constructor(
    adapter: DeepSeekAdapter,
    consumer: DeepSeekTurnConsumer,
    suppressed: DeepSeekSuppressionRegistry
  ) {
    super(adapter, consumer, suppressed);
  }
}
