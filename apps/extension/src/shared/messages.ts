import type { ConversationEvent, RuntimeStatus } from "./contracts";

export type RuntimeRequest =
  | { type: "SUBMIT_EVENT"; event: ConversationEvent }
  | { type: "GET_STATUS" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "RETRY_QUEUE" };

export type RuntimeResponse =
  | { ok: true; outcome?: "sent" | "duplicate" | "queued" | "paused" }
  | { ok: true; status: RuntimeStatus }
  | { ok: false; error: string };
