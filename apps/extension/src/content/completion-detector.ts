export interface CompletionObservation {
  key: string;
  fingerprint: string;
  state: "streaming" | "complete" | "unknown";
}

interface DetectionState {
  fingerprint: string;
  timer?: ReturnType<typeof setTimeout>;
  sentFingerprint?: string;
}

export class CompletionDetector {
  private readonly states = new Map<string, DetectionState>();

  public constructor(private readonly stableMs = 1200) {}

  public observe(observation: CompletionObservation, onComplete: () => void): void {
    const existing = this.states.get(observation.key);
    const generationChanged = existing?.fingerprint !== observation.fingerprint;
    if (generationChanged && existing?.timer) clearTimeout(existing.timer);
    const state: DetectionState = generationChanged
      ? { fingerprint: observation.fingerprint }
      : (existing ?? { fingerprint: observation.fingerprint });
    this.states.set(observation.key, state);

    if (!observation.fingerprint || state.sentFingerprint === observation.fingerprint) {
      return;
    }
    if (observation.state === "streaming") {
      if (state.timer) clearTimeout(state.timer);
      state.timer = undefined;
      return;
    }
    if (observation.state === "complete") {
      if (state.timer) clearTimeout(state.timer);
      state.timer = undefined;
      state.sentFingerprint = observation.fingerprint;
      onComplete();
      return;
    }
    if (!state.timer) {
      state.timer = setTimeout(() => {
        state.timer = undefined;
        if (state.sentFingerprint !== state.fingerprint) {
          state.sentFingerprint = state.fingerprint;
          onComplete();
        }
      }, this.stableMs);
    }
  }

  public clear(): void {
    for (const state of this.states.values()) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.states.clear();
  }
}
