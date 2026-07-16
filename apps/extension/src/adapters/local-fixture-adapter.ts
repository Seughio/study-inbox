import type {
  CompletedTurn,
  ConversationAdapter,
  TurnSnapshot,
  TurnState
} from "./types";

function textOf(element: Element | null): string {
  if (!element) return "";
  const htmlElement = element as HTMLElement;
  return htmlElement.innerText || element.textContent || "";
}

export class LocalFixtureAdapter implements ConversationAdapter {
  private observer: MutationObserver | null = null;

  public constructor(private readonly document: Document) {}

  public canHandle(url: URL, document: Document): boolean {
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      url.port === "4173" &&
      document.documentElement.hasAttribute("data-study-inbox-fixture")
    );
  }

  public startObserving(onChange: () => void): void {
    this.stopObserving();
    this.observer = new MutationObserver(onChange);
    this.observer.observe(this.document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state", "data-generation-id"]
    });
  }

  public stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  public getConversationId(): string {
    return this.document.body.dataset.conversationId ?? "local-fixture-conversation";
  }

  public getTurnElements(): Element[] {
    return Array.from(this.document.querySelectorAll("[data-fixture-turn]"));
  }

  public extractTurnSnapshot(element: Element): TurnSnapshot | null {
    if (!element.matches("[data-fixture-turn]")) return null;
    const question = textOf(element.querySelector('[data-role="user"]'));
    const answer = textOf(element.querySelector('[data-role="final-answer"]'));
    const reasoning = textOf(element.querySelector('[data-role="reasoning"]'));
    const rawState = element.getAttribute("data-state");
    const state: TurnState =
      rawState === "streaming" || rawState === "complete" ? rawState : "unknown";
    const key = element.getAttribute("data-turn-id") ?? "";
    if (!key || !question) return null;
    return {
      key,
      question,
      answer,
      reasoning,
      state,
      generationId: element.getAttribute("data-generation-id") ?? "0"
    };
  }

  public extractCompletedTurn(element: Element): CompletedTurn | null {
    const snapshot = this.extractTurnSnapshot(element);
    return snapshot?.state === "complete" && snapshot.answer
      ? { ...snapshot, state: "complete" }
      : null;
  }
}
