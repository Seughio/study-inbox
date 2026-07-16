import type { ConversationEvent, ConversationSource } from "./contracts";
import { normalizeText } from "./normalization";

export interface EventInput {
  source: ConversationSource;
  conversationId: string;
  question: string;
  answer: string;
  capturedAt?: string;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function createConversationEvent(
  input: EventInput
): Promise<ConversationEvent> {
  const question = normalizeText(input.question);
  const answer = normalizeText(input.answer);
  if (!question || !answer) {
    throw new Error("question and answer must be non-empty after normalization");
  }
  const identity = JSON.stringify([
    input.source,
    input.conversationId,
    question,
    answer
  ]);
  return {
    event_id: await sha256Hex(identity),
    source: input.source,
    conversation_id: input.conversationId,
    question,
    answer,
    captured_at: input.capturedAt ?? new Date().toISOString()
  };
}
