import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const directory = path.resolve(process.cwd(), "fixtures/doubao");
const fixtureExpectations = {
  "multi-turn.html": { user: 3, assistant: 3 },
  "ordinary-completed.html": { user: 1, assistant: 1 },
  "streaming-completed.html": { user: 1, assistant: 1 },
  "streaming-in-progress.html": { user: 1, assistant: 1 }
} as const;

// Confirmed only for sanitized fixture validation; not production adapter selectors.
const USER_SELECTOR =
  '[data-target-id="message-box-target-id"]:has(.bg-g-send-msg-bubble-bg) .md-box-root';
const ASSISTANT_SELECTOR =
  '[data-target-id="message-box-target-id"]:not(:has(.bg-g-send-msg-bubble-bg)) .md-box-root';
const SYNTHETIC_USER_TEXT = "请解释合成测试中的热力学第一定律。";
const SYNTHETIC_ASSISTANT_TEXT = "在合成测试中，热力学第一定律表示能量守恒。";
const DETECTORS = [
  { name: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  { name: "phone", expression: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/u },
  {
    name: "url-token",
    expression:
      /https?:\/\/[^\s"'<>]*(?:[?&](?:token|access_token|auth|key|signature)=|\/[A-Za-z0-9_-]{24,})/iu
  },
  {
    name: "long-random-string",
    expression:
      /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/u
  },
  {
    name: "filename",
    expression: /\b[^\s<>"']{1,80}\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|gif)\b/iu
  }
] as const;

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function maximumElementDepth(document: Document): number {
  let maximum = 0;
  function visit(element: Element, depth: number): void {
    maximum = Math.max(maximum, depth);
    Array.from(element.children).forEach((child) => visit(child, depth + 1));
  }
  visit(document.documentElement, 1);
  return maximum;
}

function findSensitiveContexts(document: Document): string[] {
  const findings: string[] = [];
  function inspect(value: string, element: Element, attributeName: string | null): void {
    for (const detector of DETECTORS) {
      if (attributeName === "class" && detector.name === "long-random-string") continue;
      if (detector.expression.test(value)) {
        findings.push(`${detector.name}:${element.tagName.toLowerCase()}:${attributeName ?? "text"}`);
      }
    }
  }

  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    if (textNode.parentElement && textNode.textContent) {
      inspect(textNode.textContent, textNode.parentElement, null);
    }
    textNode = walker.nextNode();
  }
  document.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      inspect(attribute.value, element, attribute.name.toLowerCase());
    });
  });
  return findings;
}

async function loadFixture(name: keyof typeof fixtureExpectations): Promise<{
  html: string;
  document: Document;
}> {
  const html = await readFile(path.join(directory, name), "utf8");
  return { html, document: parse(html) };
}

describe("sanitized Doubao fixtures", () => {
  it("contains exactly the four reviewed, non-placeholder fixture files", async () => {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".html")).sort();
    expect(names).toEqual(Object.keys(fixtureExpectations).sort());
  });

  for (const [name, expected] of Object.entries(fixtureExpectations) as Array<
    [keyof typeof fixtureExpectations, { user: number; assistant: number }]
  >) {
    it(`${name} is a safe, multi-layer sanitized DOM with expected message counts`, async () => {
      const { html, document } = await loadFixture(name);
      expect(html.trim().length).toBeGreaterThan(1_000);
      expect(html).not.toContain("PLACEHOLDER ONLY");
      expect(document.querySelectorAll("*").length).toBeGreaterThan(30);
      expect(maximumElementDepth(document)).toBeGreaterThanOrEqual(8);

      expect(document.querySelector("script, style")).toBeNull();
      expect(document.querySelector("[style]")).toBeNull();
      const eventAttributes = Array.from(document.querySelectorAll("*")).flatMap((element) =>
        Array.from(element.attributes).filter((attribute) => /^on/i.test(attribute.name))
      );
      expect(eventAttributes).toEqual([]);
      expect(findSensitiveContexts(document)).toEqual([]);

      const observeRows = Array.from(document.querySelectorAll("[data-observe-row]"));
      const messageIds = Array.from(document.querySelectorAll("[data-message-id]"));
      expect(observeRows.length).toBeGreaterThan(0);
      expect(messageIds.length).toBeGreaterThan(0);
      observeRows.forEach((element) => {
        expect(element.getAttribute("data-observe-row")).toMatch(/^synthetic-observe-row-\d+$/);
      });
      messageIds.forEach((element) => {
        expect(element.getAttribute("data-message-id")).toMatch(/^synthetic-message-\d+$/);
      });

      const users = Array.from(document.querySelectorAll(USER_SELECTOR));
      const assistants = Array.from(document.querySelectorAll(ASSISTANT_SELECTOR));
      expect(users).toHaveLength(expected.user);
      expect(assistants).toHaveLength(expected.assistant);
      users.forEach((element) => expect(element.textContent?.trim()).toBe(SYNTHETIC_USER_TEXT));
      assistants.forEach((element) =>
        expect(element.textContent?.trim()).toBe(SYNTHETIC_ASSISTANT_TEXT)
      );
    });
  }

  it("multi-turn preserves three ordered user-to-assistant pairs", async () => {
    const { document } = await loadFixture("multi-turn.html");
    const messageShells = Array.from(document.querySelectorAll(
      '[data-target-id="message-box-target-id"]'
    ));
    expect(messageShells).toHaveLength(6);
    const roles = messageShells.map((shell) => {
      const user = shell.querySelector(".bg-g-send-msg-bubble-bg .md-box-root");
      const assistant = shell.querySelector(":scope > * .md-box-root");
      if (user) return "user";
      if (assistant) return "assistant";
      return "unknown";
    });
    expect(roles).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
  });

  it("streaming fixtures remain structurally distinct with explicit streaming state", async () => {
    const inProgress = await loadFixture("streaming-in-progress.html");
    const completed = await loadFixture("streaming-completed.html");
    expect(inProgress.html).not.toBe(completed.html);

    const inProgressAssistant = inProgress.document.querySelector(ASSISTANT_SELECTOR);
    const completedAssistant = completed.document.querySelector(ASSISTANT_SELECTOR);
    expect(inProgressAssistant?.getAttribute("data-streaming")).toBe("true");
    expect(completedAssistant?.getAttribute("data-streaming")).toBe("false");
    expect(inProgressAssistant?.outerHTML).not.toBe(completedAssistant?.outerHTML);
  });
});
