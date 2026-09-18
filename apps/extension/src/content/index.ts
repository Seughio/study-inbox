import { DeepSeekAdapter } from "../adapters/deepseek-adapter";
import { DoubaoAdapter } from "../adapters/doubao-adapter";
import { LocalFixtureAdapter } from "../adapters/local-fixture-adapter";
import type { ConversationAdapter } from "../adapters/types";
import type { ConversationSource } from "../shared/contracts";
import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { CompletionDetector } from "./completion-detector";
import { DeepSeekCaptureSession } from "./deepseek-capture-session";
import { DeepSeekSuppressionStore } from "./deepseek-suppression";
import { DoubaoSuppressionStore } from "./doubao-suppression";
import { SiteCaptureSession } from "./site-capture-session";
import { TurnProcessor } from "./turn-processor";

interface AdapterRegistration {
  adapter: ConversationAdapter;
  source: ConversationSource;
}

const registrations: AdapterRegistration[] = [
  { adapter: new LocalFixtureAdapter(document), source: "local-fixture" },
  { adapter: new DeepSeekAdapter(document), source: "deepseek" },
  { adapter: new DoubaoAdapter(document), source: "doubao" }
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
    const deepSeekSession = source === "deepseek" && adapter instanceof DeepSeekAdapter
      ? new DeepSeekCaptureSession(
          adapter,
          processor,
          new DeepSeekSuppressionStore(adapter.getConversationId())
        )
      : null;
    const doubaoSession = source === "doubao" && adapter instanceof DoubaoAdapter
      ? new SiteCaptureSession(
          adapter,
          processor,
          new DoubaoSuppressionStore(adapter.getConversationId())
        )
      : null;
    const captureSession = deepSeekSession ?? doubaoSession;
    const scan = async (scanEnabled: boolean): Promise<void> => {
      if (captureSession) {
        await captureSession.scan(scanEnabled);
      } else if (scanEnabled) {
        for (const element of adapter.getTurnElements()) {
          const snapshot = adapter.extractTurnSnapshot(element);
          if (snapshot) processor.process(snapshot);
        }
      }
    };
    let scanQueue = Promise.resolve();
    const scheduleScan = (): void => {
      const scanEnabled = enabled;
      const run = (): Promise<void> => scan(scanEnabled);
      scanQueue = scanQueue.then(run, run).catch(() => undefined);
    };
    adapter.startObserving(scheduleScan);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.enabled) return;
      enabled = changes.enabled.newValue !== false;
      if (!enabled) processor.pause();
      scheduleScan();
    });
    scheduleScan();
  });
}
