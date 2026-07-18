import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_OPTIONAL_ORIGIN,
  DeepSeekReconController,
  type ActiveTab,
  type ReconBrowserPort
} from "../src/recon/controller";

class FakeBrowserPort implements ReconBrowserPort {
  public permissionGranted = false;
  public activeTab: ActiveTab | null = { id: 7, url: "https://chat.deepseek.com/a/chat/safe" };
  public permissionChecks = 0;
  public permissionRequests = 0;
  public executions = 0;

  public async hasPermission(origin: string): Promise<boolean> {
    expect(origin).toBe(DEEPSEEK_OPTIONAL_ORIGIN);
    this.permissionChecks += 1;
    return this.permissionGranted;
  }

  public async requestPermission(origin: string): Promise<boolean> {
    expect(origin).toBe(DEEPSEEK_OPTIONAL_ORIGIN);
    this.permissionRequests += 1;
    return this.permissionGranted;
  }

  public async getActiveTab(): Promise<ActiveTab | null> {
    return this.activeTab;
  }

  public async execute<T>(_tabId: number, func: () => T): Promise<T> {
    this.executions += 1;
    return func();
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
