export type ConversationSource = "chatgpt" | "local-fixture";

export interface ConversationEvent {
  event_id: string;
  source: ConversationSource;
  conversation_id?: string;
  question: string;
  answer: string;
  captured_at: string;
}

export type SendStatus = "never" | "sent" | "duplicate" | "queued" | "error";

export interface ExtensionState {
  enabled: boolean;
  lastSendStatus: SendStatus;
  lastSendAt?: string;
  lastError?: string;
}

export interface RuntimeStatus extends ExtensionState {
  serviceOnline: boolean;
  retryCount: number;
}
