import {
  findPreviousDoubaoUser,
  getDoubaoAssistantStructure,
  getDoubaoMessageItems,
  hasFollowingDoubaoAssistantBeforeNextUser
} from "./doubao-selectors";
import type { CompletedTurn, ConversationAdapter, TurnSnapshot } from "./types";

const MINIMUM_TEXT_LENGTH = 2;

function textOf(element: Element): string {
  const htmlElement = element as HTMLElement;
  return (htmlElement.innerText || element.textContent || "").trim();
}

export class DoubaoAdapter implements ConversationAdapter {
  private observer: MutationObserver | null = null;

  public constructor(private readonly document: Document) {}

  public canHandle(url: URL): boolean {
    return url.protocol === "https:"
      && url.hostname === "www.doubao.com"
      && url.port === ""
      && url.hash === ""
      && /^\/chat\/[^/]+\/?$/.test(url.pathname);
  }

  public startObserving(onChange: () => void): void {
    this.stopObserving();
    this.observer = new MutationObserver(onChange);
    this.observer.observe(this.document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-streaming"]
    });
  }

  public stopObserving(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  public getConversationId(): string {
    return "doubao-page";
  }

  public getTurnElements(): Element[] {
    return getDoubaoMessageItems(this.document).filter((item) =>
      getDoubaoAssistantStructure(item) !== null
      && findPreviousDoubaoUser(item) !== null
      && !hasFollowingDoubaoAssistantBeforeNextUser(item)
    );
  }

  public extractTurnSnapshot(element: Element): TurnSnapshot | null {
    const items = getDoubaoMessageItems(this.document);
    const itemIndex = items.indexOf(element);
    if (itemIndex < 0) return null;
    const assistant = getDoubaoAssistantStructure(element);
    if (!assistant || hasFollowingDoubaoAssistantBeforeNextUser(element)) return null;
    const user = findPreviousDoubaoUser(element);
    if (!user) return null;

    const question = textOf(user.body);
    const answer = textOf(assistant.body);
    if (question.length < MINIMUM_TEXT_LENGTH || answer.length < MINIMUM_TEXT_LENGTH) {
      return null;
    }
    return {
      key: `doubao:turn-${itemIndex}`,
      question,
      answer,
      state: assistant.streaming ? "streaming" : "unknown",
      generationId: "initial"
    };
  }

  public extractCompletedTurn(): CompletedTurn | null {
    return null;
  }
}
