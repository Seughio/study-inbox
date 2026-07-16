import { LocalFixtureAdapter } from "../adapters/local-fixture-adapter";
import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { CompletionDetector } from "./completion-detector";
import { TurnProcessor } from "./turn-processor";

const adapter = new LocalFixtureAdapter(document);
let enabled = true;

async function loadEnabled(): Promise<void> {
  const stored = await chrome.storage.local.get("enabled");
  enabled = stored.enabled !== false;
}

if (adapter.canHandle(new URL(location.href), document)) {
  void loadEnabled().then(() => {
    const processor = new TurnProcessor({
      conversationId: adapter.getConversationId(),
      detector: new CompletionDetector(),
      isEnabled: () => enabled,
      submit: async (event) => {
        const request: RuntimeRequest = { type: "SUBMIT_EVENT", event };
        await chrome.runtime.sendMessage<RuntimeRequest, RuntimeResponse>(request);
      }
    });
    const scan = (): void => {
      if (!enabled) return;
      for (const element of adapter.getTurnElements()) {
        const snapshot = adapter.extractTurnSnapshot(element);
        if (snapshot) processor.process(snapshot);
      }
    };
    adapter.startObserving(scan);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.enabled) return;
      enabled = changes.enabled.newValue !== false;
      if (enabled) scan();
      else processor.pause();
    });
    scan();
  });
}
