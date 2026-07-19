import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  content_scripts: Array<{ matches: string[] }>;
}

async function readManifest(): Promise<ExtensionManifest> {
  const manifestPath = path.resolve(process.cwd(), "manifest.json");
  return JSON.parse(await readFile(manifestPath, "utf8")) as ExtensionManifest;
}

describe("manifest permissions", () => {
  it("keeps DeepSeek and Doubao access optional and requests no prohibited capability", async () => {
    const manifest = await readManifest();

    expect(manifest.permissions).toEqual(["storage", "scripting", "alarms"]);
    expect(manifest.host_permissions).toEqual([
      "http://127.0.0.1:4173/*",
      "http://127.0.0.1:8765/*"
    ]);
    expect(manifest.optional_host_permissions).toEqual([
      "https://chat.deepseek.com/*",
      "https://www.doubao.com/*"
    ]);
    expect(manifest.content_scripts.flatMap(({ matches }) => matches)).toEqual([
      "http://127.0.0.1:4173/*"
    ]);
    expect(manifest.permissions).not.toEqual(
      expect.arrayContaining(["tabs", "history", "downloads", "cookies", "webRequest", "debugger"])
    );
    expect([...manifest.host_permissions, ...manifest.optional_host_permissions]).not.toContain(
      "<all_urls>"
    );
    expect(manifest.host_permissions).not.toContain("https://www.doubao.com/*");
    expect(manifest.optional_host_permissions).not.toContain("https://*.doubao.com/*");
    expect(manifest.optional_host_permissions).not.toContain("http://www.doubao.com/*");
    expect(manifest.content_scripts.flatMap(({ matches }) => matches)).not.toContain(
      "https://www.doubao.com/*"
    );
  });
});
