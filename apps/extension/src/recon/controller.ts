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

export interface ReconSiteConfig {
  key: string;
  optionalOrigin: string;
  pageOrigin: string;
  pagePath?: RegExp;
  allowHash?: boolean;
}

export const DEEPSEEK_RECON_SITE: ReconSiteConfig = {
  key: "deepseek",
  optionalOrigin: DEEPSEEK_OPTIONAL_ORIGIN,
  pageOrigin: "https://chat.deepseek.com"
};

export const DOUBAO_OPTIONAL_ORIGIN = "https://www.doubao.com/*";
export const DOUBAO_RECON_SITE: ReconSiteConfig = {
  key: "doubao",
  optionalOrigin: DOUBAO_OPTIONAL_ORIGIN,
  pageOrigin: "https://www.doubao.com",
  pagePath: /^\/chat\/[^/]+\/?$/,
  allowHash: false
};

export interface ActiveTab {
  id: number;
  url?: string;
}

export interface ReconBrowserPort {
  hasPermission(origin: string): Promise<boolean>;
  requestPermission(origin: string): Promise<boolean>;
  removePermission(origin: string): Promise<boolean>;
  getActiveTab(): Promise<ActiveTab | null>;
  execute<T>(tabId: number, func: (siteKey: string) => T, siteKey: string): Promise<T>;
}

export type ReconResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "disabled" | "permission-denied" | "wrong-page" | "execution-failed" };

export class SiteReconController {
  private developerMode = false;

  public constructor(
    private readonly browser: ReconBrowserPort,
    private readonly site: ReconSiteConfig
  ) {}

  public setDeveloperMode(enabled: boolean): void {
    this.developerMode = enabled;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.developerMode) return false;
    return this.browser.requestPermission(this.site.optionalOrigin);
  }

  public async removePermission(): Promise<boolean> {
    await this.cancelSelection();
    await this.clearSelectedNode();
    return this.browser.removePermission(this.site.optionalOrigin);
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

  private async run<T>(func: (siteKey: string) => T): Promise<ReconResult<T>> {
    if (!this.developerMode) return { ok: false, reason: "disabled" };
    if (!(await this.browser.hasPermission(this.site.optionalOrigin))) {
      return { ok: false, reason: "permission-denied" };
    }
    const tab = await this.browser.getActiveTab();
    if (!tab?.url || !this.matchesCurrentPage(tab.url)) {
      return { ok: false, reason: "wrong-page" };
    }
    try {
      return { ok: true, value: await this.browser.execute(tab.id, func, this.site.key) };
    } catch {
      return { ok: false, reason: "execution-failed" };
    }
  }

  private matchesCurrentPage(value: string): boolean {
    try {
      const url = new URL(value);
      return url.origin === this.site.pageOrigin
        && (!this.site.pagePath || this.site.pagePath.test(url.pathname))
        && (this.site.allowHash !== false || url.hash === "");
    } catch {
      return false;
    }
  }
}

export class DeepSeekReconController extends SiteReconController {
  public constructor(browser: ReconBrowserPort) {
    super(browser, DEEPSEEK_RECON_SITE);
  }
}

export class DoubaoReconController extends SiteReconController {
  public constructor(browser: ReconBrowserPort) {
    super(browser, DOUBAO_RECON_SITE);
  }
}

export class ChromeReconBrowserPort implements ReconBrowserPort {
  public async hasPermission(origin: string): Promise<boolean> {
    return chrome.permissions.contains({ origins: [origin] });
  }

  public async requestPermission(origin: string): Promise<boolean> {
    return chrome.permissions.request({ origins: [origin] });
  }

  public async removePermission(origin: string): Promise<boolean> {
    return chrome.permissions.remove({ origins: [origin] });
  }

  public async getActiveTab(): Promise<ActiveTab | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return typeof tab?.id === "number" ? { id: tab.id, url: tab.url } : null;
  }

  public async execute<T>(
    tabId: number,
    func: (siteKey: string) => T,
    siteKey: string
  ): Promise<T> {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func, args: [siteKey] });
    return result?.result as T;
  }
}
