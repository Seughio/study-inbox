import { beforeEach, describe, expect, it } from "vitest";
import {
  armSingleNodeSelection,
  cancelNodeSelection,
  clearSelectedNode,
  getSelectedNodeSummary,
  inspectCurrentPage,
  readSelectedNodeHtml
} from "../src/recon/inspector";

function setRect(
  element: Element,
  values: Partial<DOMRect> = {}
): void {
  const rect = {
    x: 10,
    y: 20,
    width: 240,
    height: 80,
    top: 20,
    right: 250,
    bottom: 100,
    left: 10,
    toJSON: () => ({}),
    ...values
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect
  });
}

function hover(element: Element): void {
  element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

function key(name: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

describe("privacy-preserving DOM inspector", () => {
  beforeEach(() => {
    cancelNodeSelection();
    clearSelectedNode();
    document.body.innerHTML = "";
    setRect(document.body, { width: 1200, height: 800, right: 1200, bottom: 800 });
  });

  it("returns structure and text lengths without message text", () => {
    document.body.innerHTML = `
      <main class="conversation" data-conversation-id="private-123">
        <article aria-description="private message body">private message body</article>
      </main>`;

    const snapshot = inspectCurrentPage();
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("private message body");
    expect(serialized).not.toContain("private-123");
    expect(serialized).toContain("[redacted]");
    expect(snapshot.root.children[0]?.children[0]?.textLength).toBe(20);
  });

  it("creates an independent pointer-transparent overlay in selection mode", () => {
    const target = document.createElement("article");
    target.setAttribute("style", "color: blue");
    document.body.append(target);
    setRect(target);

    armSingleNodeSelection();
    const overlay = document.querySelector<HTMLElement>("[data-study-inbox-recon-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay?.style.pointerEvents).toBe("none");
    expect(target.getAttribute("style")).toBe("color: blue");
  });

  it("updates the overlay when hovering different elements and on resize", () => {
    document.body.innerHTML = '<article id="first"></article><section class="second extra third"></section>';
    const first = document.querySelector("#first")!;
    const second = document.querySelector("section")!;
    setRect(first, { left: 5, top: 6, width: 100, height: 30 });
    setRect(second, { left: 40, top: 50, width: 300, height: 120 });
    armSingleNodeSelection();

    hover(first);
    const overlay = document.querySelector<HTMLElement>("[data-study-inbox-recon-overlay]")!;
    expect(overlay.style.left).toBe("5px");
    expect(overlay.textContent).toContain("article#first");
    hover(second);
    expect(overlay.style.left).toBe("40px");
    expect(overlay.textContent).toContain("section.second.extra");

    setRect(second, { left: 70, top: 80, width: 320, height: 140 });
    window.dispatchEvent(new Event("resize"));
    expect(overlay.style.left).toBe("70px");
    expect(overlay.textContent).toContain("320×140");
  });

  it("moves up to a parent and down to the previous child", () => {
    document.body.innerHTML = "<article><div><p><span>synthetic sentence</span></p></div></article>";
    const span = document.querySelector("span")!;
    setRect(span);
    setRect(span.parentElement!);
    armSingleNodeSelection();
    hover(span);

    key("ArrowUp");
    let overlay = document.querySelector<HTMLElement>("[data-study-inbox-recon-overlay]")!;
    expect(overlay.textContent).toContain("p ·");
    key("ArrowDown");
    expect(overlay.textContent).toContain("span ·");

    span.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }));
    expect(overlay.textContent).toContain("p ·");
    span.dispatchEvent(new WheelEvent("wheel", { deltaY: 1, bubbles: true, cancelable: true }));
    overlay = document.querySelector<HTMLElement>("[data-study-inbox-recon-overlay]")!;
    expect(overlay.textContent).toContain("span ·");
  });

  it("cancels with Escape and removes overlay and listeners", () => {
    const target = document.createElement("article");
    document.body.append(target);
    setRect(target);
    armSingleNodeSelection();
    hover(target);
    key("Escape");

    expect(document.querySelector("[data-study-inbox-recon-overlay]")).toBeNull();
    hover(target);
    expect(document.querySelector("[data-study-inbox-recon-overlay]")).toBeNull();
    expect(getSelectedNodeSummary()).toBeNull();
  });

  it("confirms outerHTML and a structured summary in page memory", () => {
    document.body.innerHTML = `
      <article id="answer" class="message assistant selected" data-state="complete" aria-live="polite">
        <p>This is a sufficiently long synthetic assistant answer.</p><button>copy</button>
      </article>`;
    const target = document.querySelector("article")!;
    setRect(target, { width: 480, height: 160 });
    armSingleNodeSelection();
    hover(target);
    key("Enter");

    const html = readSelectedNodeHtml();
    const summary = getSelectedNodeSummary();
    expect(html).toContain('<article id="answer"');
    expect(html).toContain("<p>This is a sufficiently long synthetic assistant answer.</p>");
    expect(summary).toMatchObject({
      tagName: "article",
      id: "answer",
      classes: ["message", "assistant", "selected"],
      childElementCount: 2,
      sourceDomain: "localhost"
    });
    expect(summary?.textLength).toBeGreaterThan(20);
    const pageRecord = (globalThis as Record<string, unknown>)[
      "__studyInboxPendingDeepSeekNode"
    ] as { dataAttributes: unknown; ariaAttributes: unknown };
    expect(pageRecord.dataAttributes).toEqual([{ name: "data-state", value: "complete" }]);
    expect(pageRecord.ariaAttributes).toEqual([{ name: "aria-live", value: "polite" }]);
    expect(summary).not.toHaveProperty("dataAttributes");
    expect(summary).not.toHaveProperty("ariaAttributes");
    expect(summary?.bounds).toMatchObject({ width: 480, height: 160 });
    expect(document.querySelector("[data-study-inbox-recon-overlay]")).toBeNull();
  });

  it("warns for a likely innermost text element", () => {
    const target = document.createElement("span");
    target.textContent = "short sentence";
    document.body.append(target);
    setRect(target);
    armSingleNodeSelection();
    hover(target);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(getSelectedNodeSummary()?.warnings).toContain(
      "当前可能只选中了句子或最内层文本元素，建议向上选择父节点。"
    );
  });

  it("warns for a navigation or page-scale selection", () => {
    const target = document.createElement("main");
    target.innerHTML = "<nav><a>synthetic navigation</a></nav><article>synthetic answer content</article>";
    document.body.append(target);
    setRect(target, { width: 1100, height: 760, right: 1100, bottom: 760 });
    armSingleNodeSelection();
    hover(target);
    key("Enter");

    expect(getSelectedNodeSummary()?.warnings).toContain(
      "当前范围可能过大，建议向下缩小选择范围。"
    );
  });

  it("clears the selected raw HTML from page memory", () => {
    const target = document.createElement("article");
    target.textContent = "synthetic answer long enough for selection";
    document.body.append(target);
    setRect(target);
    armSingleNodeSelection();
    hover(target);
    key("Enter");
    expect(readSelectedNodeHtml()).not.toBeNull();

    clearSelectedNode();
    expect(readSelectedNodeHtml()).toBeNull();
    expect(getSelectedNodeSummary()).toBeNull();
  });

  it("contains no code that reads cookies, browser storage, or network data", () => {
    const sources = [
      inspectCurrentPage,
      armSingleNodeSelection,
      getSelectedNodeSummary,
      readSelectedNodeHtml,
      clearSelectedNode,
      cancelNodeSelection
    ].map((func) => func.toString()).join("\n");
    expect(sources).not.toMatch(/document\.cookie|localStorage|sessionStorage|XMLHttpRequest|fetch\s*\(/);
  });
});
