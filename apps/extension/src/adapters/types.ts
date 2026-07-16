export type TurnState = "streaming" | "complete" | "unknown";

export interface TurnSnapshot {
  key: string;
  question: string;
  answer: string;
  reasoning?: string;
  state: TurnState;
  generationId: string;
}

export interface CompletedTurn extends TurnSnapshot {
  state: "complete";
}

export interface ConversationAdapter {
  canHandle(url: URL, document: Document): boolean;
  startObserving(onChange: () => void): void;
  stopObserving(): void;
  getConversationId(): string;
  getTurnElements(): Element[];
  extractTurnSnapshot(element: Element): TurnSnapshot | null;
  extractCompletedTurn(element: Element): CompletedTurn | null;
}
