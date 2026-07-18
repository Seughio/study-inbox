import {
  DEEPSEEK_VIRTUAL_ITEM_SELECTOR,
  findPreviousUserStructure,
  getAssistantStructure,
  getDeepSeekVirtualItems,
  hasFollowingAssistantBeforeNextUser
} from "./deepseek-selectors";
import type {
  CompletedTurn,
  ConversationAdapter,
  TurnSnapshot
} from "./types";

const MINIMUM_TEXT_LENGTH = 2;

function textOf(element: Element): string {
  const htmlElement = element as HTMLElement;
  return (htmlElement.innerText || element.textContent || "").trim();
}

export class DeepSeekAdapter implements ConversationAdapter {
  private observer: MutationObserver | null = null;

  public constructor(private readonly document: Document) {}

  public canHandle(url: URL): boolean {
    return url.protocol === "https:" && url.hostname === "chat.deepseek.com";
  }

  public startObserving(onChange: () => void): void {
    this.stopObserving();
    this.observer = new MutationObserver(onChange);
    this.observer.observe(this.document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  public stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  public getConversationId(): string {
    return "deepseek-page";
  }

  public getTurnElements(): Element[] {
    const items = getDeepSeekVirtualItems(this.document);
    const keyCounts = new Map<string, number>();
    for (const item of items) {
      const key = item.getAttribute("data-virtual-list-item-key") ?? "";
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    return items.filter((item) => {
      const key = item.getAttribute("data-virtual-list-item-key") ?? "";
      return Boolean(key) && keyCounts.get(key) === 1 && getAssistantStructure(item) !== null;
    });
  }

  public extractTurnSnapshot(element: Element): TurnSnapshot | null {
    if (!element.matches(DEEPSEEK_VIRTUAL_ITEM_SELECTOR)) return null;
    const assistant = getAssistantStructure(element);
    if (!assistant || hasFollowingAssistantBeforeNextUser(element)) return null;
    const user = findPreviousUserStructure(element);
    if (!user) return null;

    const key = element.getAttribute("data-virtual-list-item-key") ?? "";
    const question = textOf(user.messageShell);
    const answer = textOf(assistant.finalAnswer);
    if (
      !key
      || question.length < MINIMUM_TEXT_LENGTH
      || answer.length < MINIMUM_TEXT_LENGTH
    ) return null;

    return {
      key: `deepseek:${key}`,
      question,
      answer,
      state: assistant.hasOperationRegion ? "unknown" : "streaming",
      generationId: "initial"
    };
  }

  public extractCompletedTurn(): CompletedTurn | null {
    return null;
  }
}
