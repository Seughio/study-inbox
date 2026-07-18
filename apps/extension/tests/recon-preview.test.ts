import { beforeEach, describe, expect, it } from "vitest";
import { renderSelectionPreview, type ReconPreviewElements } from "../src/popup/recon-preview";
import type { SelectedNodeSummary } from "../src/recon/inspector";

function previewElements(): ReconPreviewElements {
  document.body.innerHTML = `
    <section id="panel" hidden>
      <span id="node"></span><span id="classes"></span><span id="text"></span>
      <span id="html"></span><span id="children"></span><span id="time"></span>
      <span id="domain"></span><p id="warning" hidden></p><textarea id="debug"></textarea>
    </section>`;
  return {
    panel: document.querySelector("#panel")!,
    node: document.querySelector("#node")!,
    classes: document.querySelector("#classes")!,
    textLength: document.querySelector("#text")!,
    htmlLength: document.querySelector("#html")!,
    childCount: document.querySelector("#children")!,
    selectedAt: document.querySelector("#time")!,
    sourceDomain: document.querySelector("#domain")!,
    warning: document.querySelector("#warning")!,
    debug: document.querySelector("#debug")!
  };
}

const summary: SelectedNodeSummary = {
  tagName: "article",
  id: "assistant-answer",
  classes: ["message", "assistant"],
  attributeNames: ["id", "class", "data-state", "aria-live"],
  domPath: "body > main > article:nth-of-type(2)",
  tagStructure: "body > main > article",
  childStructure: ["p", "pre"],
  textLength: 128,
  htmlLength: 420,
  childNodeCount: 4,
  childElementCount: 2,
  bounds: { x: 10, y: 20, width: 500, height: 200, top: 20, right: 510, bottom: 220, left: 10 },
  selectedAt: "2026-07-16T14:00:00.000Z",
  sourceDomain: "chat.deepseek.com",
  warnings: ["当前范围可能过大，建议向下缩小选择范围。"]
};

describe("recon selection preview", () => {
  let elements: ReconPreviewElements;

  beforeEach(() => {
    elements = previewElements();
  });

  it("shows selection metadata, warning, and a body-free developer summary", () => {
    renderSelectionPreview(summary, elements);

    expect(elements.panel.hidden).toBe(false);
    expect(elements.node.textContent).toBe("article#assistant-answer");
    expect(elements.classes.textContent).toBe("message assistant");
    expect(elements.textLength.textContent).toBe("128");
    expect(elements.htmlLength.textContent).toBe("420");
    expect(elements.childCount.textContent).toBe("4（元素 2）");
    expect(elements.selectedAt.textContent).toBe("2026-07-16T14:00:00.000Z");
    expect(elements.sourceDomain.textContent).toBe("chat.deepseek.com");
    expect(elements.warning.textContent).toContain("范围可能过大");
    expect(elements.debug.value).toContain("body > main > article");
    expect(elements.debug.value).toContain("data-state");
    expect(elements.debug.value).not.toContain("complete");
  });

  it("hides and clears the preview when selection is cleared", () => {
    renderSelectionPreview(summary, elements);
    renderSelectionPreview(null, elements);

    expect(elements.panel.hidden).toBe(true);
    expect(elements.debug.value).toBe("");
    expect(elements.warning.hidden).toBe(true);
  });
});
