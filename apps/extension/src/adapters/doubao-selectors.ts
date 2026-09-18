export const DOUBAO_MESSAGE_ITEM_SELECTOR = '[data-target-id="message-box-target-id"]';
export const DOUBAO_VIRTUAL_ROW_SELECTOR = ".v_list_row[data-observe-row]";
export const DOUBAO_MESSAGE_MARKER_SELECTOR = "[data-message-id]";
export const DOUBAO_MARKDOWN_BODY_SELECTOR = ".md-box-root";
export const DOUBAO_USER_BUBBLE_SELECTOR = ".bg-g-send-msg-bubble-bg";
export const DOUBAO_SEND_ACTION_SELECTOR =
  '[data-foundation-type="send-message-action-bar"]';
export const DOUBAO_RECEIVE_ACTION_SELECTOR =
  '[data-foundation-type="receive-message-action-bar"]';
export const DOUBAO_TEXT_BLOCK_SELECTOR = '[data-container-type="block-v2"]';
export const DOUBAO_PLAIN_PLUGIN_SELECTOR =
  '[data-render-engine="node"][data-plugin-identifier="block_type:10000"]';

const UNSUPPORTED_CONTENT_SELECTOR = [
  "a",
  "pre",
  "code",
  "table",
  "img",
  "picture",
  "audio",
  "video",
  "canvas",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "select",
  "[contenteditable]"
].join(", ");

interface DoubaoMessageStructure {
  item: Element;
  row: Element;
  body: Element;
}

export interface DoubaoUserStructure extends DoubaoMessageStructure {
  role: "user";
}

export interface DoubaoAssistantStructure extends DoubaoMessageStructure {
  role: "assistant";
  streaming: boolean;
}

type DoubaoRole = "user" | "assistant";

function matchesExactlyOne(root: Element, selector: string): Element | null {
  const matches = Array.from(root.querySelectorAll(selector));
  return matches.length === 1 ? matches[0] ?? null : null;
}

function getBaseMessageStructure(item: Element): DoubaoMessageStructure | null {
  if (!item.matches(DOUBAO_MESSAGE_ITEM_SELECTOR)) return null;
  const row = item.closest(DOUBAO_VIRTUAL_ROW_SELECTOR);
  if (!row || !row.contains(item)) return null;
  if (!matchesExactlyOne(item, DOUBAO_MESSAGE_MARKER_SELECTOR)) return null;

  const body = matchesExactlyOne(item, DOUBAO_MARKDOWN_BODY_SELECTOR);
  const textBlock = matchesExactlyOne(item, DOUBAO_TEXT_BLOCK_SELECTOR);
  const plugin = matchesExactlyOne(item, DOUBAO_PLAIN_PLUGIN_SELECTOR);
  if (!body || !textBlock || !plugin) return null;
  if (!textBlock.contains(body) || !plugin.contains(body)) return null;
  if (item.querySelectorAll("[data-container-type]").length !== 1) return null;
  if (item.querySelectorAll("[data-plugin-identifier]").length !== 1) return null;
  if (!body.hasAttribute("data-streaming")) return null;
  const streaming = body.getAttribute("data-streaming");
  if (streaming !== "true" && streaming !== "false") return null;
  if (body.querySelector(UNSUPPORTED_CONTENT_SELECTOR)) return null;
  return { item, row, body };
}

function getRoleHint(item: Element): DoubaoRole | null {
  const bubbles = item.querySelectorAll(DOUBAO_USER_BUBBLE_SELECTOR).length;
  const sendActions = item.querySelectorAll(DOUBAO_SEND_ACTION_SELECTOR).length;
  const receiveActions = item.querySelectorAll(DOUBAO_RECEIVE_ACTION_SELECTOR).length;
  if (bubbles === 1 && sendActions === 1 && receiveActions === 0) return "user";
  if (bubbles === 0 && sendActions === 0 && receiveActions === 1) return "assistant";
  return null;
}

export function getDoubaoMessageItems(document: Document): Element[] {
  return Array.from(document.querySelectorAll(DOUBAO_MESSAGE_ITEM_SELECTOR));
}

export function getDoubaoUserStructure(item: Element): DoubaoUserStructure | null {
  if (getRoleHint(item) !== "user") return null;
  const base = getBaseMessageStructure(item);
  if (!base || base.body.getAttribute("data-streaming") !== "false") return null;
  const bubble = matchesExactlyOne(item, DOUBAO_USER_BUBBLE_SELECTOR);
  if (!bubble?.contains(base.body)) return null;
  return { ...base, role: "user" };
}

export function getDoubaoAssistantStructure(
  item: Element
): DoubaoAssistantStructure | null {
  if (getRoleHint(item) !== "assistant") return null;
  const base = getBaseMessageStructure(item);
  if (!base) return null;
  const receiveAction = matchesExactlyOne(item, DOUBAO_RECEIVE_ACTION_SELECTOR);
  const streaming = base.body.getAttribute("data-streaming") === "true";
  if (!receiveAction) return null;
  if (!streaming && !receiveAction.querySelector("button, [role='button']")) return null;
  return {
    ...base,
    role: "assistant",
    streaming
  };
}

export function findPreviousDoubaoUser(
  assistantItem: Element
): DoubaoUserStructure | null {
  const items = getDoubaoMessageItems(assistantItem.ownerDocument);
  const assistantIndex = items.indexOf(assistantItem);
  if (assistantIndex < 0) return null;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (!candidate) continue;
    const role = getRoleHint(candidate);
    if (role === "assistant") return null;
    if (role === "user") return getDoubaoUserStructure(candidate);
  }
  return null;
}

export function hasFollowingDoubaoAssistantBeforeNextUser(item: Element): boolean {
  const items = getDoubaoMessageItems(item.ownerDocument);
  const itemIndex = items.indexOf(item);
  if (itemIndex < 0) return true;
  for (let index = itemIndex + 1; index < items.length; index += 1) {
    const candidate = items[index];
    if (!candidate) continue;
    const role = getRoleHint(candidate);
    if (role === "user") return false;
    if (role === "assistant") return true;
  }
  return false;
}
