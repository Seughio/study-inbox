export interface InspectedAttribute {
  name: string;
  value: string;
}

export interface InspectedNode {
  tagName: string;
  classes: string[];
  attributes: InspectedAttribute[];
  textLength: number;
  childElementCount: number;
  children: InspectedNode[];
}

export interface StructuralSnapshot {
  version: 1;
  capturedAt: string;
  publicPathStructure: string[];
  truncated: boolean;
  nodeCount: number;
  root: InspectedNode;
}

export interface SelectedNodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SelectedNodeSummary {
  tagName: string;
  id: string;
  classes: string[];
  attributeNames: string[];
  domPath: string;
  tagStructure: string;
  childStructure: string[];
  textLength: number;
  htmlLength: number;
  childNodeCount: number;
  childElementCount: number;
  bounds: SelectedNodeBounds;
  selectedAt: string;
  sourceDomain: string;
  warnings: string[];
}

export interface StoredNodeSelection {
  outerHTML: string;
  dataAttributes: InspectedAttribute[];
  ariaAttributes: InspectedAttribute[];
  summary: SelectedNodeSummary;
}

/** Self-contained so chrome.scripting can serialize it without module globals. */
export function inspectCurrentPage(): StructuralSnapshot {
  const maximumNodes = 2000;
  const maximumDepth = 18;
  let nodeCount = 0;
  let truncated = false;
  const sensitiveName = /(account|user|email|phone|token|secret|conversation|chat.?id|file|title|name|message|content|prompt|answer|question)/i;
  const sensitiveValue = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d -]{8,}\d|[a-z0-9_-]{24,})/i;

  function safeValue(element: Element, name: string, value: string): string {
    const visibleText = element.textContent?.trim() ?? "";
    const mirrorsVisibleText = value.length > 0
      && visibleText.length > 0
      && (visibleText.includes(value) || value.includes(visibleText));
    if (sensitiveName.test(name) || sensitiveValue.test(value) || mirrorsVisibleText) {
      return "[redacted]";
    }
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }

  function visit(element: Element, depth: number): InspectedNode {
    nodeCount++;
    const children: InspectedNode[] = [];
    if (depth < maximumDepth && nodeCount < maximumNodes) {
      for (const child of Array.from(element.children)) {
        if (nodeCount >= maximumNodes) {
          truncated = true;
          break;
        }
        children.push(visit(child, depth + 1));
      }
    } else if (element.childElementCount > 0) {
      truncated = true;
    }
    const attributes = Array.from(element.attributes)
      .filter(({ name }) => name.startsWith("data-") || name.startsWith("aria-"))
      .map(({ name, value }) => ({ name, value: safeValue(element, name, value) }));
    return {
      tagName: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      attributes,
      textLength: element.textContent?.length ?? 0,
      childElementCount: element.childElementCount,
      children
    };
  }

  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => sensitiveValue.test(segment) || segment.length > 20
      ? ":redacted"
      : segment
    );
  const root = visit(document.body, 0);
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    publicPathStructure: pathSegments,
    truncated,
    nodeCount,
    root
  };
}

/** Self-contained interactive selector for chrome.scripting serialization. */
export function armSingleNodeSelection(): { armed: true } {
  const stateKey = "__studyInboxDeepSeekReconSelectionState";
  const pageMemory = globalThis as Record<string, unknown>;
  const previousState = pageMemory[stateKey] as { cleanup?: () => void } | undefined;
  previousState?.cleanup?.();

  const overlay = document.createElement("div");
  overlay.setAttribute("data-study-inbox-recon-overlay", "true");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    display: "none",
    pointerEvents: "none",
    zIndex: "2147483647",
    boxSizing: "border-box",
    border: "2px solid #ff3b30",
    background: "rgba(255, 59, 48, 0.16)",
    boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.9) inset"
  });
  const label = document.createElement("div");
  Object.assign(label.style, {
    position: "absolute",
    left: "-2px",
    bottom: "100%",
    maxWidth: "min(520px, 90vw)",
    padding: "4px 7px",
    borderRadius: "4px 4px 0 0",
    background: "rgba(125, 24, 18, 0.94)",
    color: "#fff",
    font: "12px/1.35 system-ui, sans-serif",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  });
  overlay.append(label);
  document.documentElement.append(overlay);

  let baseTarget: Element | null = null;
  let current: Element | null = null;
  const childHistory: Element[] = [];
  const forbiddenTags = new Set(["HTML", "HEAD", "BODY", "SCRIPT", "STYLE"]);

  function isSelectable(element: Element | null): element is Element {
    return element !== null
      && !forbiddenTags.has(element.tagName)
      && !element.hasAttribute("data-study-inbox-recon-overlay");
  }

  function parentDepth(element: Element): number {
    let depth = 0;
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      depth += 1;
      parent = parent.parentElement;
    }
    return depth;
  }

  function describe(element: Element, rect: DOMRect): string {
    const id = element.id ? `#${element.id}` : "";
    const classes = Array.from(element.classList).slice(0, 2).map((name) => `.${name}`).join("");
    return `${element.tagName.toLowerCase()}${id}${classes} · ${Math.round(rect.width)}×${Math.round(rect.height)} · 父级深度 ${parentDepth(element)}`;
  }

  function refreshOverlay(): void {
    if (!current || !current.isConnected) {
      overlay.style.display = "none";
      return;
    }
    const rect = current.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    label.style.bottom = rect.top >= 28 ? "100%" : "auto";
    label.style.top = rect.top >= 28 ? "auto" : "0";
    label.textContent = describe(current, rect);
  }

  function setHoveredTarget(target: EventTarget | null): void {
    const element = target instanceof Element ? target : null;
    if (!isSelectable(element) || element === baseTarget) return;
    baseTarget = element;
    current = element;
    childHistory.length = 0;
    refreshOverlay();
  }

  function moveToParent(): void {
    if (!current) return;
    const parent = current.parentElement;
    if (!isSelectable(parent)) return;
    childHistory.push(current);
    current = parent;
    refreshOverlay();
  }

  function moveToChild(): void {
    const child = childHistory.pop();
    if (!child?.isConnected) return;
    current = child;
    refreshOverlay();
  }

  function buildDomPath(element: Element): string {
    const segments: string[] = [];
    let cursor: Element | null = element;
    while (cursor && cursor !== document.documentElement) {
      let segment = cursor.tagName.toLowerCase();
      const parentElement: Element | null = cursor.parentElement;
      if (parentElement) {
        const sameTag = Array.from(parentElement.children).filter(
          (sibling: Element) => sibling.tagName === cursor?.tagName
        );
        if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(cursor) + 1})`;
      }
      segments.unshift(segment);
      cursor = parentElement;
    }
    return segments.join(" > ");
  }

  function riskWarnings(element: Element, outerHTML: string): string[] {
    const warnings: string[] = [];
    const textLength = element.textContent?.length ?? 0;
    const directTextNodes = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0);
    const tooSmall = textLength < 20
      || directTextNodes.length === 1
      || element.childElementCount === 0
      || outerHTML.length < 100;
    const accountPattern = /(account|profile|avatar|user[-_]?menu|用户|账号)/i;
    const hasAccountArea = [element, ...Array.from(element.querySelectorAll("*"))].some((descendant) =>
      Array.from(descendant.attributes).some(({ name, value }) =>
        accountPattern.test(name) || accountPattern.test(value)
      )
    );
    const bodyRect = document.body.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const bodyArea = bodyRect.width * bodyRect.height;
    const coverage = bodyArea > 0 ? (rect.width * rect.height) / bodyArea : 0;
    const tooLarge = element === document.body
      || element.matches("nav, [role='navigation']")
      || element.matches("input, textarea, select")
      || element.querySelector("nav, [role='navigation'], input, textarea, select") !== null
      || hasAccountArea
      || textLength > 20_000
      || coverage >= 0.85;
    if (tooSmall) {
      warnings.push("当前可能只选中了句子或最内层文本元素，建议向上选择父节点。");
    }
    if (tooLarge) {
      warnings.push("当前范围可能过大，建议向下缩小选择范围。");
    }
    return warnings;
  }

  function confirmSelection(): void {
    if (!current) return;
    const selectionKey = "__studyInboxPendingDeepSeekNode";
    const rect = current.getBoundingClientRect();
    const outerHTML = current.outerHTML;
    const ancestors: string[] = [];
    let ancestor: Element | null = current;
    while (ancestor && ancestor !== document.documentElement) {
      ancestors.unshift(ancestor.tagName.toLowerCase());
      ancestor = ancestor.parentElement;
    }
    const dataAttributes = Array.from(current.attributes)
      .filter(({ name }) => name.startsWith("data-"))
      .map(({ name, value }) => ({ name, value }));
    const ariaAttributes = Array.from(current.attributes)
      .filter(({ name }) => name.startsWith("aria-"))
      .map(({ name, value }) => ({ name, value }));
    pageMemory[selectionKey] = {
      outerHTML,
      dataAttributes,
      ariaAttributes,
      summary: {
        tagName: current.tagName.toLowerCase(),
        id: current.id,
        classes: Array.from(current.classList),
        attributeNames: Array.from(current.attributes).map(({ name }) => name),
        domPath: buildDomPath(current),
        tagStructure: ancestors.join(" > "),
        childStructure: Array.from(current.children).slice(0, 100).map((child) => child.tagName.toLowerCase()),
        textLength: current.textContent?.length ?? 0,
        htmlLength: outerHTML.length,
        childNodeCount: current.childNodes.length,
        childElementCount: current.childElementCount,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left
        },
        selectedAt: new Date().toISOString(),
        sourceDomain: location.hostname,
        warnings: riskWarnings(current, outerHTML)
      }
    };
    cleanup();
  }

  function handleMouseMove(event: MouseEvent): void {
    setHoveredTarget(event.target);
  }

  function handleWheel(event: WheelEvent): void {
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY < 0) moveToParent();
    else if (event.deltaY > 0) moveToChild();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveToParent();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveToChild();
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      confirmSelection();
    }
  }

  function handleClick(event: MouseEvent): void {
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    confirmSelection();
  }

  function cleanup(): void {
    document.removeEventListener("mousemove", handleMouseMove, true);
    document.removeEventListener("wheel", handleWheel, true);
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("click", handleClick, true);
    window.removeEventListener("scroll", refreshOverlay, true);
    window.removeEventListener("resize", refreshOverlay);
    overlay.remove();
    if (pageMemory[stateKey] === state) delete pageMemory[stateKey];
  }

  const state = { cleanup };
  pageMemory[stateKey] = state;
  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("click", handleClick, true);
  window.addEventListener("scroll", refreshOverlay, true);
  window.addEventListener("resize", refreshOverlay);
  return { armed: true };
}

export function getSelectedNodeSummary(): SelectedNodeSummary | null {
  const selectionKey = "__studyInboxPendingDeepSeekNode";
  const selection = (globalThis as Record<string, unknown>)[selectionKey] as StoredNodeSelection | undefined;
  return selection?.summary ?? null;
}

export function readSelectedNodeHtml(): string | null {
  const selectionKey = "__studyInboxPendingDeepSeekNode";
  const selection = (globalThis as Record<string, unknown>)[selectionKey] as StoredNodeSelection | undefined;
  return selection?.outerHTML ?? null;
}

export function clearSelectedNode(): { cleared: true } {
  const selectionKey = "__studyInboxPendingDeepSeekNode";
  delete (globalThis as Record<string, unknown>)[selectionKey];
  return { cleared: true };
}

export function cancelNodeSelection(): { cancelled: true } {
  const stateKey = "__studyInboxDeepSeekReconSelectionState";
  const pageMemory = globalThis as Record<string, unknown>;
  const state = pageMemory[stateKey] as { cleanup?: () => void } | undefined;
  state?.cleanup?.();
  delete pageMemory[stateKey];
  return { cancelled: true };
}
