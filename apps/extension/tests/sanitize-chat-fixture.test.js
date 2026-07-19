import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  sanitizeChatHtml,
  sanitizeFixtureFile
} from "../tools/sanitize-chat-fixture.mjs";
import { sanitizeDeepSeekHtml } from "../tools/sanitize-deepseek-fixture.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("site-independent chat fixture sanitizer", () => {
  it("requires both explicit role selectors and never guesses roles", () => {
    expect(() => sanitizeChatHtml("<main><p>question</p><p>answer</p></main>", {})).toThrow(
      "必须显式提供"
    );
  });

  it("uses the same implementation through the compatible DeepSeek entry point", () => {
    const html = '<main><div class="human">private q</div><div class="bot">private a</div></main>';
    const options = { userSelector: ".human", assistantSelector: ".bot" };
    expect(sanitizeDeepSeekHtml(html, options)).toEqual(sanitizeChatHtml(html, options));
  });

  it("deterministically anonymizes observed rows and message ids without retaining originals", () => {
    const originals = {
      observeOne: "opaque-observe-row-111111111111111111111111111111111",
      observeTwo: "opaque-observe-row-222222222222222222222222222222222",
      messageOne: "private-message-111111111111111111111111111111111",
      messageTwo: "private-message-222222222222222222222222222222222"
    };
    const result = sanitizeChatHtml(
      `<main>
        <div class="user" data-observe-row="${originals.observeOne}"
          data-message-id="${originals.messageOne}" style="transform: translateY(10px)">question</div>
        <div class="assistant" data-observe-row="${originals.observeOne}"
          data-message-id="${originals.messageOne}" style="width: 100px">answer</div>
        <aside data-observe-row="${originals.observeTwo}"
          data-message-id="${originals.messageTwo}">structure</aside>
      </main>`,
      { userSelector: ".user", assistantSelector: ".assistant" }
    );

    expect(result.html.match(/data-observe-row="synthetic-observe-row-1"/g)).toHaveLength(2);
    expect(result.html).toContain('data-observe-row="synthetic-observe-row-2"');
    expect(result.html.match(/data-message-id="synthetic-message-1"/g)).toHaveLength(2);
    expect(result.html).toContain('data-message-id="synthetic-message-2"');
    expect(result.report.anonymizedAttributes).toEqual({
      "data-observe-row": 3,
      "data-message-id": 3
    });
    expect(result.report.removed.inlineStyleAttributes).toBe(2);
    expect(result.html).not.toContain("style=");
    for (const original of Object.values(originals)) {
      expect(result.html).not.toContain(original);
      expect(JSON.stringify(result.report)).not.toContain(original);
    }
  });

  it("does not treat a long CSS class token as a long random string", () => {
    const result = sanitizeChatHtml(
      `<main><div class="user">q</div><div class="assistant">a</div>
       <aside class="component-grid-layout-version-1234567890abcdef">layout</aside></main>`,
      { userSelector: ".user", assistantSelector: ".assistant" }
    );

    expect(result.findings).not.toContain("long-random-string");
    expect(result.html).toContain("component-grid-layout-version-1234567890abcdef");
  });

  it("still blocks long random strings in ordinary attributes and text", () => {
    const randomAttribute = "attribute1234567890attribute1234567890";
    const randomText = "text1234567890text1234567890text1234567890";
    const result = sanitizeChatHtml(
      `<main><div class="user">q</div><div class="assistant">a</div>
       <aside data-value="${randomAttribute}">${randomText}</aside></main>`,
      { userSelector: ".user", assistantSelector: ".assistant" }
    );

    expect(result.findings).toContain("long-random-string");
    expect(result.report.sensitiveFindings).toEqual(expect.arrayContaining([
      { type: "long-random-string", tagName: "aside", attributeName: "data-value" },
      { type: "long-random-string", tagName: "aside", attributeName: null }
    ]));
    expect(JSON.stringify(result.report)).not.toContain(randomAttribute);
    expect(JSON.stringify(result.report)).not.toContain(randomText);
  });

  it("keeps email, phone, URL token, and filename detection in contextual scanning", () => {
    const result = sanitizeChatHtml(
      `<main><div class="user">q</div><div class="assistant">a</div>
       <i class="owner@example.com"></i><i data-value="13800138000"></i>
       <i data-value="https://example.test/x?token=secret"></i>
       <i data-value="private-notes.pdf"></i></main>`,
      { userSelector: ".user", assistantSelector: ".assistant" }
    );

    expect(result.findings).toEqual(expect.arrayContaining([
      "email",
      "phone",
      "url-token",
      "filename"
    ]));
  });

  it("reports only finding context and refuses to overwrite an existing output", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "study-inbox-chat-sanitize-"));
    temporaryDirectories.push(directory);
    const sensitiveInput = path.join(directory, "sensitive.html");
    const sensitiveOutput = path.join(directory, "sensitive-output.html");
    const randomValue = "private1234567890private1234567890private";
    await writeFile(
      sensitiveInput,
      `<main><div class="user">q</div><div class="assistant">a</div><aside data-value="${randomValue}"></aside></main>`
    );
    await expect(sanitizeFixtureFile({
      input: sensitiveInput,
      output: sensitiveOutput,
      userSelector: ".user",
      assistantSelector: ".assistant"
    })).rejects.toThrow("long-random-string 位于 <aside> 属性 data-value");
    await expect(readFile(sensitiveOutput, "utf8")).rejects.toThrow();

    const cleanInput = path.join(directory, "clean.html");
    const existingOutput = path.join(directory, "existing.html");
    await writeFile(cleanInput, '<main><div class="user">q</div><div class="assistant">a</div></main>');
    await writeFile(existingOutput, "preserve me");
    await expect(sanitizeFixtureFile({
      input: cleanInput,
      output: existingOutput,
      userSelector: ".user",
      assistantSelector: ".assistant"
    })).rejects.toMatchObject({ code: "EEXIST" });
    await expect(readFile(existingOutput, "utf8")).resolves.toBe("preserve me");
  });
});
