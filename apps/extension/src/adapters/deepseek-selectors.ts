export const DEEPSEEK_VIRTUAL_ITEM_SELECTOR = "[data-virtual-list-item-key]";
export const DEEPSEEK_MESSAGE_CLASS = "ds-message";
export const DEEPSEEK_ASSISTANT_CONTENT_CLASS = "ds-assistant-message-main-content";
export const DEEPSEEK_MARKDOWN_CLASS = "ds-markdown";

const UNSUPPORTED_FINAL_CONTENT_SELECTOR = [
  "a",
  "pre",
  "code",
  "img",
  "picture",
  "audio",
  "video",
  "canvas",
  "iframe",
  "object",
  "embed"
].join(", ");

export interface DeepSeekAssistantStructure {
  item: Element;
  messageShell: Element;
  finalAnswer: Element;
  hasOperationRegion: boolean;
}

export interface DeepSeekUserStructure {
  item: Element;
  messageShell: Element;
}

export function getDeepSeekVirtualItems(document: Document): Element[] {
  return Array.from(document.querySelectorAll(DEEPSEEK_VIRTUAL_ITEM_SELECTOR));
}

export function getDirectMessageShell(item: Element): Element | null {
  const matches = Array.from(item.children).filter((child) =>
    child.classList.contains(DEEPSEEK_MESSAGE_CLASS)
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function getDirectAssistantAnswer(messageShell: Element): Element | null {
  const matches = Array.from(messageShell.children).filter((child) =>
    child.classList.contains(DEEPSEEK_ASSISTANT_CONTENT_CLASS)
    && child.classList.contains(DEEPSEEK_MARKDOWN_CLASS)
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function getAssistantStructure(item: Element): DeepSeekAssistantStructure | null {
  if (!item.matches(DEEPSEEK_VIRTUAL_ITEM_SELECTOR)) return null;
  const messageShell = getDirectMessageShell(item);
  if (!messageShell || messageShell.children.length !== 1) return null;
  const finalAnswer = getDirectAssistantAnswer(messageShell);
  if (!finalAnswer || finalAnswer.querySelector(UNSUPPORTED_FINAL_CONTENT_SELECTOR)) return null;
  const operationRegions = Array.from(item.children).filter(
    (child) => child !== messageShell
  );
  return {
    item,
    messageShell,
    finalAnswer,
    hasOperationRegion: operationRegions.some((region) =>
      region.matches("button, [role='button']")
      || region.querySelector("button, [role='button']") !== null
    )
  };
}

function getPlainUserStructure(item: Element): DeepSeekUserStructure | null {
  const messageShell = getDirectMessageShell(item);
  if (!messageShell || getDirectAssistantAnswer(messageShell)) return null;
  if (messageShell.children.length !== 1) return null;
  const [content] = Array.from(messageShell.children);
  if (!content || content.childElementCount !== 0) return null;
  return { item, messageShell };
}

export function findPreviousUserStructure(
  assistantItem: Element
): DeepSeekUserStructure | null {
  let candidate = assistantItem.previousElementSibling;
  while (candidate) {
    if (!candidate.matches(DEEPSEEK_VIRTUAL_ITEM_SELECTOR)) {
      candidate = candidate.previousElementSibling;
      continue;
    }
    const messageShell = getDirectMessageShell(candidate);
    if (!messageShell) {
      candidate = candidate.previousElementSibling;
      continue;
    }
    if (getDirectAssistantAnswer(messageShell)) return null;
    return getPlainUserStructure(candidate);
  }
  return null;
}

export function hasFollowingAssistantBeforeNextUser(item: Element): boolean {
  let candidate = item.nextElementSibling;
  while (candidate) {
    if (!candidate.matches(DEEPSEEK_VIRTUAL_ITEM_SELECTOR)) {
      candidate = candidate.nextElementSibling;
      continue;
    }
    const messageShell = getDirectMessageShell(candidate);
    if (!messageShell) {
      candidate = candidate.nextElementSibling;
      continue;
    }
    return getDirectAssistantAnswer(messageShell) !== null;
  }
  return false;
}
