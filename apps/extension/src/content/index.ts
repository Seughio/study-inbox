import { DeepSeekAdapter } from "../adapters/deepseek-adapter";
import { LocalFixtureAdapter } from "../adapters/local-fixture-adapter";
import type { ConversationAdapter } from "../adapters/types";
import type { ConversationSource } from "../shared/contracts";
import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { CompletionDetector } from "./completion-detector";
import { TurnProcessor } from "./turn-processor";

interface AdapterRegistration {
  adapter: ConversationAdapter;
  source: ConversationSource;
}

const registrations: AdapterRegistration[] = [
  { adapter: new LocalFixtureAdapter(document), source: "local-fixture" },
  { adapter: new DeepSeekAdapter(document), source: "deepseek" }
];
const currentUrl = new URL(location.href);
const registration = registrations.find(({ adapter }) =>
  adapter.canHandle(currentUrl, document)
);
let enabled = true;

async function loadEnabled(): Promise<void> {
  const stored = await chrome.storage.local.get("enabled");
  enabled = stored.enabled !== false;
}

if (registration) {
  void loadEnabled().then(() => {
    const { adapter, source } = registration;
    const processor = new TurnProcessor({
      conversationId: adapter.getConversationId(),
      source,
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
