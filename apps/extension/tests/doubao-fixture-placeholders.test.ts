import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const directory = path.resolve(process.cwd(), "fixtures/doubao");
const expectedHtml = [
  "multi-turn.html",
  "ordinary-completed.html",
  "streaming-completed.html",
  "streaming-in-progress.html"
];

describe("Doubao fixture placeholders", () => {
  it("contains only explicit safe HTML placeholders for the four required states", async () => {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".html")).sort();
    expect(names).toEqual(expectedHtml);
    for (const name of names) {
      const contents = await readFile(path.join(directory, name), "utf8");
      expect(contents).toMatch(/^<!-- PLACEHOLDER ONLY:/);
      expect(contents).not.toMatch(/<(?:html|body|main|article|section|script)\b/i);
    }
  });
});
