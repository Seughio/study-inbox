import type { SelectedNodeSummary } from "../recon/inspector";

export interface ReconPreviewElements {
  panel: HTMLElement;
  node: HTMLElement;
  classes: HTMLElement;
  textLength: HTMLElement;
  htmlLength: HTMLElement;
  childCount: HTMLElement;
  selectedAt: HTMLElement;
  sourceDomain: HTMLElement;
  warning: HTMLElement;
  debug: HTMLTextAreaElement;
}

export function renderSelectionPreview(
  summary: SelectedNodeSummary | null,
  elements: ReconPreviewElements
): void {
  elements.panel.hidden = summary === null;
  if (!summary) {
    elements.node.textContent = "无";
    elements.classes.textContent = "无";
    elements.textLength.textContent = "0";
    elements.htmlLength.textContent = "0";
    elements.childCount.textContent = "0";
    elements.selectedAt.textContent = "无";
    elements.sourceDomain.textContent = "无";
    elements.warning.textContent = "";
    elements.warning.hidden = true;
    elements.debug.value = "";
    return;
  }

  const id = summary.id ? `#${summary.id}` : "";
  elements.node.textContent = `${summary.tagName}${id}`;
  elements.classes.textContent = summary.classes.length > 0 ? summary.classes.join(" ") : "无";
  elements.textLength.textContent = String(summary.textLength);
  elements.htmlLength.textContent = String(summary.htmlLength);
  elements.childCount.textContent = `${summary.childNodeCount}（元素 ${summary.childElementCount}）`;
  elements.selectedAt.textContent = summary.selectedAt;
  elements.sourceDomain.textContent = summary.sourceDomain;
  elements.warning.textContent = summary.warnings.join("\n");
  elements.warning.hidden = summary.warnings.length === 0;
  elements.debug.value = JSON.stringify({
    domPath: summary.domPath,
    tagStructure: summary.tagStructure,
    attributeNames: summary.attributeNames,
    childStructure: summary.childStructure,
    textLength: summary.textLength
  }, null, 2);
}
