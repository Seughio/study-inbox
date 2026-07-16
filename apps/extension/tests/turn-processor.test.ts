import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionDetector } from "../src/content/completion-detector";
import { TurnProcessor } from "../src/content/turn-processor";
import type { ConversationEvent } from "../src/shared/contracts";

afterEach(() => vi.useRealTimers());

describe("TurnProcessor", () => {
  it("does not collect while paused", async () => {
    const submit = vi.fn(async () => undefined);
    const processor = new TurnProcessor({
      conversationId: "paused",
      detector: new CompletionDetector(10),
      isEnabled: () => false,
      submit
    });
    processor.process({
      key: "1", question: "数学问题", answer: "函数回答",
      state: "complete", generationId: "1"
    });
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits a regenerated answer as a new stable event", async () => {
    const submitted: ConversationEvent[] = [];
    const submit = vi.fn(async (event: ConversationEvent) => {
      submitted.push(event);
    });
    const processor = new TurnProcessor({
      conversationId: "regenerate",
      detector: new CompletionDetector(),
      isEnabled: () => true,
      submit
    });
    processor.process({
      key: "1", question: "数学问题", answer: "旧函数回答",
      state: "complete", generationId: "1"
    });
    processor.process({
      key: "1", question: "数学问题", answer: "新函数回答",
      state: "complete", generationId: "2"
    });
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submitted[0]?.event_id).not.toBe(submitted[1]?.event_id);
  });
});
