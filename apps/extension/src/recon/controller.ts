import {
  armSingleNodeSelection,
  cancelNodeSelection,
  clearSelectedNode,
  getSelectedNodeSummary,
  inspectCurrentPage,
  readSelectedNodeHtml,
  type SelectedNodeSummary,
  type StructuralSnapshot
} from "./inspector";

export const DEEPSEEK_OPTIONAL_ORIGIN = "https://chat.deepseek.com/*";

export interface ActiveTab {
  id: number;
  url?: string;
}

export interface ReconBrowserPort {
  hasPermission(origin: string): Promise<boolean>;
  requestPermission(origin: string): Promise<boolean>;
  getActiveTab(): Promise<ActiveTab | null>;
  execute<T>(tabId: number, func: () => T): Promise<T>;
}

export type ReconResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "disabled" | "permission-denied" | "wrong-page" | "execution-failed" };

export class DeepSeekReconController {
  private developerMode = false;

  public constructor(private readonly browser: ReconBrowserPort) {}

  public setDeveloperMode(enabled: boolean): void {
    this.developerMode = enabled;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.developerMode) return false;
    return this.browser.requestPermission(DEEPSEEK_OPTIONAL_ORIGIN);
  }

  public async inspect(): Promise<ReconResult<StructuralSnapshot>> {
    return this.run(inspectCurrentPage);
  }

  public async armSelection(): Promise<ReconResult<{ armed: true }>> {
    return this.run(armSingleNodeSelection);
  }

  public async getSelectedNodeSummary(): Promise<ReconResult<SelectedNodeSummary | null>> {
    return this.run(getSelectedNodeSummary);
  }

  public async readSelectedNodeHtml(): Promise<ReconResult<string | null>> {
    return this.run(readSelectedNodeHtml);
  }

  public async clearSelectedNode(): Promise<ReconResult<{ cleared: true }>> {
    return this.run(clearSelectedNode);
  }

  public async cancelSelection(): Promise<ReconResult<{ cancelled: true }>> {
    return this.run(cancelNodeSelection);
  }

  private async run<T>(func: () => T): Promise<ReconResult<T>> {
    if (!this.developerMode) return { ok: false, reason: "disabled" };
    if (!(await this.browser.hasPermission(DEEPSEEK_OPTIONAL_ORIGIN))) {
      return { ok: false, reason: "permission-denied" };
    }
    const tab = await this.browser.getActiveTab();
    if (!tab?.url?.startsWith("https://chat.deepseek.com/")) {
      return { ok: false, reason: "wrong-page" };
    }
    try {
      return { ok: true, value: await this.browser.execute(tab.id, func) };
    } catch {
      return { ok: false, reason: "execution-failed" };
    }
  }
}

export class ChromeReconBrowserPort implements ReconBrowserPort {
  public async hasPermission(origin: string): Promise<boolean> {
    return chrome.permissions.contains({ origins: [origin] });
  }

  public async requestPermission(origin: string): Promise<boolean> {
    return chrome.permissions.request({ origins: [origin] });
  }

  public async getActiveTab(): Promise<ActiveTab | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return typeof tab?.id === "number" ? { id: tab.id, url: tab.url } : null;
  }

  public async execute<T>(tabId: number, func: () => T): Promise<T> {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func });
    return result?.result as T;
  }
}
