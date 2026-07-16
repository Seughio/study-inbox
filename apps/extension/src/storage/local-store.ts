import type { ConversationEvent, ExtensionState } from "../shared/contracts";

export const STORAGE_KEYS = {
  enabled: "enabled",
  retryQueue: "retryQueue",
  lastSendStatus: "lastSendStatus",
  lastSendAt: "lastSendAt",
  lastError: "lastError"
} as const;

export interface QueueStore {
  getQueue(): Promise<ConversationEvent[]>;
  setQueue(queue: ConversationEvent[]): Promise<void>;
}

export class ChromeLocalStore implements QueueStore {
  public async getQueue(): Promise<ConversationEvent[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.retryQueue);
    return Array.isArray(result.retryQueue)
      ? (result.retryQueue as ConversationEvent[])
      : [];
  }

  public async setQueue(queue: ConversationEvent[]): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.retryQueue]: queue });
  }

  public async getState(): Promise<ExtensionState> {
    const result = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
    return {
      enabled: result.enabled !== false,
      lastSendStatus: result.lastSendStatus ?? "never",
      lastSendAt: result.lastSendAt,
      lastError: result.lastError
    } as ExtensionState;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });
  }

  public async setSendState(
    status: ExtensionState["lastSendStatus"],
    error?: string
  ): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.lastSendStatus]: status,
      [STORAGE_KEYS.lastSendAt]: new Date().toISOString(),
      [STORAGE_KEYS.lastError]: error
    });
  }
}
