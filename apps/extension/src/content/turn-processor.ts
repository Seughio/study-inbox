import type { TurnSnapshot } from "../adapters/types";
import type { ConversationEvent } from "../shared/contracts";
import { createConversationEvent } from "../shared/event";
import { normalizeText } from "../shared/normalization";
import type { CompletionDetector } from "./completion-detector";

export interface TurnProcessorOptions {
  conversationId: string;
  detector: CompletionDetector;
  isEnabled: () => boolean;
  submit: (event: ConversationEvent) => Promise<void>;
}

export class TurnProcessor {
  public constructor(private readonly options: TurnProcessorOptions) {}

  public process(snapshot: TurnSnapshot): void {
    if (!this.options.isEnabled()) return;
    const question = normalizeText(snapshot.question);
    const answer = normalizeText(snapshot.answer);
    if (!question || !answer) return;
    const fingerprint = JSON.stringify([
      snapshot.generationId,
      question,
      answer
    ]);
    this.options.detector.observe(
      { key: snapshot.key, fingerprint, state: snapshot.state },
      () => void this.finalize(question, answer)
    );
  }

  public pause(): void {
    this.options.detector.clear();
  }

  private async finalize(question: string, answer: string): Promise<void> {
    if (!this.options.isEnabled()) return;
    const event = await createConversationEvent({
      source: "local-fixture",
      conversationId: this.options.conversationId,
      question,
      answer
    });
    if (this.options.isEnabled()) await this.options.submit(event);
  }
}
