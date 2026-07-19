import { describe, expect, it } from "vitest";

import { sanitizeChatHtml } from "../tools/sanitize-chat-fixture.mjs";
import { sanitizeDeepSeekHtml } from "../tools/sanitize-deepseek-fixture.mjs";

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
});
