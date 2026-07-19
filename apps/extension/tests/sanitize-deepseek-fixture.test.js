import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import {
  detectSensitiveContent,
  sanitizeDeepSeekHtml,
  sanitizeFixtureFile
} from "../tools/sanitize-deepseek-fixture.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("DeepSeek fixture sanitizer", () => {
  it("removes active content and event attributes", () => {
    const result = sanitizeDeepSeekHtml(
      `<main><div class="user" onclick="steal()">question<script>steal()</script></div>
       <div class="assistant" onmouseover="steal()">answer<svg></svg></div></main>`,
      { userSelector: ".user", assistantSelector: ".assistant" }
    );

    expect(result.html).not.toMatch(/<script|<svg|onclick|onmouseover/);
    expect(result.report.removed.scripts).toBe(1);
    expect(result.report.removed.eventAttributes).toBe(2);
  });

  it("replaces user and assistant bodies with fixed synthetic text", () => {
    const result = sanitizeDeepSeekHtml(
      `<section><div data-role="user"><span>REAL USER BODY</span></div>
       <div data-role="assistant"><p>REAL ASSISTANT BODY</p></div></section>`,
      { userSelector: '[data-role="user"]', assistantSelector: '[data-role="assistant"]' }
    );

    expect(result.html).not.toContain("REAL USER BODY");
    expect(result.html).not.toContain("REAL ASSISTANT BODY");
    expect(result.html).toContain("请解释合成测试中的热力学第一定律。");
    expect(result.html).toContain("在合成测试中，热力学第一定律表示能量守恒。");
    expect(result.html).toContain('<span>请解释');
    expect(result.html).toContain('<p>在合成');
  });

  it("removes link queries and redacts account, file, and conversation identifiers", () => {
    const result = sanitizeDeepSeekHtml(
      `<main data-conversation-id="conversation-secret" data-filename="private.pdf">
       <div class="user">q</div><div class="assistant">a</div>
       <a href="/share/public?token=private">share</a><span data-file-name="private.pdf">private.pdf</span>
       <span aria-account="private-account">profile</span></main>`,
      { userSelector: ".user", assistantSelector: ".assistant" }
    );

    expect(result.html).not.toContain("conversation-secret");
    expect(result.html).not.toContain("private.pdf");
    expect(result.html).not.toContain("token=private");
    expect(result.html).not.toContain("private-account");
    expect(result.html).toContain("[REDACTED]");
  });

  it("detects suspected sensitive values", () => {
    expect(detectSensitiveContent("contact owner@example.com")).toContain("email");
    expect(detectSensitiveContent("call 13800138000")).toContain("phone");
    expect(detectSensitiveContent("https://example.test/x?token=secret")).toContain("url-token");
    expect(detectSensitiveContent("abc1234567890abc1234567890abc1234567890")).toContain(
      "long-random-string"
    );
    expect(detectSensitiveContent("uploaded private-notes.pdf")).toContain("filename");
  });

  it("rejects raw input placed anywhere in the Git repository", async () => {
    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const fixtureInput = path.resolve(testDirectory, "../fixtures/deepseek/ordinary-completed.html");
    await expect(
      sanitizeFixtureFile({
        input: fixtureInput,
        output: path.join(os.tmpdir(), "never-written.html"),
        userSelector: ".user",
        assistantSelector: ".assistant"
      })
    ).rejects.toThrow("原始 HTML 不得放入 Git 仓库");
  });

  it("does not write a final fixture when sanitized output still looks sensitive", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "study-inbox-sanitize-"));
    temporaryDirectories.push(directory);
    const input = path.join(directory, "raw.html");
    const output = path.join(directory, "final.html");
    await writeFile(
      input,
      '<main><div class="user">q</div><div class="assistant">a</div><aside>owner@example.com</aside></main>'
    );

    await expect(
      sanitizeFixtureFile({
        input,
        output,
        userSelector: ".user",
        assistantSelector: ".assistant"
      })
    ).rejects.toThrow("疑似敏感内容");
    await expect(readFile(output, "utf8")).rejects.toThrow();
  });

  it("writes only sanitized HTML and a structure report for a clean external input", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "study-inbox-sanitize-"));
    temporaryDirectories.push(directory);
    const input = path.join(directory, "raw.html");
    const output = path.join(directory, "final.html");
    await writeFile(
      input,
      '<main><div class="user">temporary raw body</div><div class="assistant">temporary answer</div></main>'
    );

    const report = await sanitizeFixtureFile({
      input,
      output,
      userSelector: ".user",
      assistantSelector: ".assistant"
    });
    const sanitized = await readFile(output, "utf8");
    const savedReport = JSON.parse(await readFile(`${output}.report.json`, "utf8"));
    expect(sanitized).not.toContain("temporary raw body");
    expect(sanitized).not.toContain("temporary answer");
    expect(savedReport).toEqual(report);
    expect(savedReport.matchedMessageNodes).toEqual({ user: 1, assistant: 1 });
  });
});
