import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionDetector } from "../src/content/completion-detector";

describe("CompletionDetector", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not complete while streaming", () => {
    const done = vi.fn();
    const detector = new CompletionDetector(1000);
    detector.observe({ key: "1", fingerprint: "partial", state: "streaming" }, done);
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });

  it("completes once after a stable interval", () => {
    const done = vi.fn();
    const detector = new CompletionDetector(1000);
    const observation = { key: "1", fingerprint: "answer", state: "unknown" } as const;
    detector.observe(observation, done);
    vi.advanceTimersByTime(999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    detector.observe(observation, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated DOM scans after completion", () => {
    const done = vi.fn();
    const detector = new CompletionDetector();
    const observation = { key: "1", fingerprint: "answer", state: "complete" } as const;
    detector.observe(observation, done);
    detector.observe(observation, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("cancels the old timer when regeneration starts", () => {
    const oldDone = vi.fn();
    const newDone = vi.fn();
    const detector = new CompletionDetector(1000);
    detector.observe({ key: "1", fingerprint: "old", state: "unknown" }, oldDone);
    vi.advanceTimersByTime(500);
    detector.observe({ key: "1", fingerprint: "new", state: "streaming" }, newDone);
    vi.advanceTimersByTime(2000);
    expect(oldDone).not.toHaveBeenCalled();
    detector.observe({ key: "1", fingerprint: "new", state: "complete" }, newDone);
    expect(newDone).toHaveBeenCalledTimes(1);
  });
});
