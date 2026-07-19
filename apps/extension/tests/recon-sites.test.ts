import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function source(relativePath: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("site reconnaissance wiring", () => {
  it("shows separate DeepSeek and Doubao controls", async () => {
    const html = await source("src/popup/index.html");
    expect(html).toContain("DeepSeek 侦察（开发工具）");
    expect(html).toContain("豆包侦察（开发工具）");
    expect(html).toContain('id="deepseek-recon-authorize"');
    expect(html).toContain('id="doubao-recon-authorize"');
    expect(html).toContain('id="deepseek-recon-revoke"');
    expect(html).toContain('id="doubao-recon-revoke"');
  });

  it("stores only independent developer-mode booleans, never selected HTML", async () => {
    const popup = await source("src/popup/index.ts");
    const inspector = await source("src/recon/inspector.ts");
    expect(popup).toContain('storageKey: "deepSeekReconDeveloperMode"');
    expect(popup).toContain('storageKey: "doubaoReconDeveloperMode"');
    expect(popup.match(/chrome\.storage\.session\.set/g)).toHaveLength(2);
    expect(popup).not.toMatch(/chrome\.storage\.(?:local|sync)\.set/);
    expect(inspector).not.toMatch(/chrome\.storage|localStorage|sessionStorage/);
  });

  it("does not add a Doubao adapter or Doubao content-script registration", async () => {
    const popup = await source("src/popup/index.ts");
    const background = await source("src/background/index.ts");
    const content = await source("src/content/index.ts");
    expect(`${popup}\n${background}\n${content}`).not.toContain("DoubaoAdapter");
    expect(background).not.toMatch(/doubao-content-registration/i);
  });
});
