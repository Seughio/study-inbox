import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_OPTIONAL_ORIGIN,
  DOUBAO_OPTIONAL_ORIGIN,
  DeepSeekReconController,
  DoubaoReconController,
  type ActiveTab,
  type ReconBrowserPort
} from "../src/recon/controller";

class FakeBrowserPort implements ReconBrowserPort {
  public permissionGranted = false;
  public activeTab: ActiveTab | null = { id: 7, url: "https://chat.deepseek.com/a/chat/safe" };
  public permissionChecks = 0;
  public permissionRequests = 0;
  public permissionRemovals = 0;
  public executions = 0;
  public executedSiteKeys: string[] = [];

  public constructor(private readonly expectedOrigin = DEEPSEEK_OPTIONAL_ORIGIN) {}

  public async hasPermission(origin: string): Promise<boolean> {
    expect(origin).toBe(this.expectedOrigin);
    this.permissionChecks += 1;
    return this.permissionGranted;
  }

  public async requestPermission(origin: string): Promise<boolean> {
    expect(origin).toBe(this.expectedOrigin);
    this.permissionRequests += 1;
    return this.permissionGranted;
  }

  public async removePermission(origin: string): Promise<boolean> {
    expect(origin).toBe(this.expectedOrigin);
    this.permissionRemovals += 1;
    return this.permissionGranted;
  }

  public async getActiveTab(): Promise<ActiveTab | null> {
    return this.activeTab;
  }

  public async execute<T>(
    _tabId: number,
    func: (siteKey: string) => T,
    siteKey: string
  ): Promise<T> {
    this.executions += 1;
    this.executedSiteKeys.push(siteKey);
    return func(siteKey);
  }
}

describe("DeepSeek reconnaissance controller", () => {
  it("does not run or request permission by default", async () => {
    const browser = new FakeBrowserPort();
    const controller = new DeepSeekReconController(browser);

    await expect(controller.inspect()).resolves.toEqual({ ok: false, reason: "disabled" });
    await expect(controller.getSelectedNodeSummary()).resolves.toEqual({ ok: false, reason: "disabled" });
    await expect(controller.requestPermission()).resolves.toBe(false);
    expect(browser.permissionChecks).toBe(0);
    expect(browser.permissionRequests).toBe(0);
    expect(browser.executions).toBe(0);
  });

  it("fails safely when optional host permission is not granted", async () => {
    const browser = new FakeBrowserPort();
    const controller = new DeepSeekReconController(browser);
    controller.setDeveloperMode(true);

    await expect(controller.inspect()).resolves.toEqual({ ok: false, reason: "permission-denied" });
    expect(browser.permissionChecks).toBe(1);
    expect(browser.executions).toBe(0);
  });

  it("exports nothing until the user explicitly arms and selects a node", async () => {
    const browser = new FakeBrowserPort();
    browser.permissionGranted = true;
    const controller = new DeepSeekReconController(browser);
    controller.setDeveloperMode(true);

    const beforeSelection = await controller.getSelectedNodeSummary();
    expect(beforeSelection).toEqual({ ok: true, value: null });
    expect(browser.executions).toBe(1);

    const armed = await controller.armSelection();
    expect(armed).toEqual({ ok: true, value: { armed: true } });
    expect(browser.executions).toBe(2);
  });
});

describe("Doubao reconnaissance controller", () => {
  it("fails safely without the independent optional permission", async () => {
    const browser = new FakeBrowserPort(DOUBAO_OPTIONAL_ORIGIN);
    browser.activeTab = { id: 8, url: "https://www.doubao.com/chat/synthetic-id" };
    const controller = new DoubaoReconController(browser);
    controller.setDeveloperMode(true);

    await expect(controller.inspect()).resolves.toEqual({ ok: false, reason: "permission-denied" });
    expect(browser.executions).toBe(0);
  });

  it("injects only on the confirmed ordinary conversation path", async () => {
    const browser = new FakeBrowserPort(DOUBAO_OPTIONAL_ORIGIN);
    browser.permissionGranted = true;
    const controller = new DoubaoReconController(browser);
    controller.setDeveloperMode(true);

    browser.activeTab = { id: 8, url: "https://www.doubao.com/" };
    await expect(controller.inspect()).resolves.toEqual({ ok: false, reason: "wrong-page" });
    browser.activeTab = { id: 8, url: "https://www.doubao.com/chat/synthetic-id#route" };
    await expect(controller.inspect()).resolves.toEqual({ ok: false, reason: "wrong-page" });
    browser.activeTab = { id: 8, url: "https://www.doubao.com/chat/synthetic-id" };
    await expect(controller.inspect()).resolves.toMatchObject({ ok: true });
    expect(browser.executedSiteKeys).toEqual(["doubao"]);
  });

  it("revokes only the Doubao permission", async () => {
    const browser = new FakeBrowserPort(DOUBAO_OPTIONAL_ORIGIN);
    browser.permissionGranted = true;
    browser.activeTab = { id: 8, url: "https://www.doubao.com/chat/synthetic-id" };
    const controller = new DoubaoReconController(browser);
    controller.setDeveloperMode(true);

    await expect(controller.removePermission()).resolves.toBe(true);
    expect(browser.permissionRemovals).toBe(1);
    expect(browser.executedSiteKeys).toEqual(["doubao", "doubao"]);
  });
});
