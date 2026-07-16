import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalApiClient } from "../src/background/api-client";
import type { ConversationEvent } from "../src/shared/contracts";

const event: ConversationEvent = {
  event_id: "api-test",
  source: "local-fixture",
  conversation_id: "api-test",
  question: "数学问题",
  answer: "函数回答",
  captured_at: "2026-01-01T00:00:00Z"
};

afterEach(() => vi.unstubAllGlobals());

describe("LocalApiClient", () => {
  it("handles created=true as a successful send", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ created: true }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await new LocalApiClient().send(event)).toBe("sent");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:8765/api/v1/conversations"
    );
  });

  it("handles created=false without treating it as an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ created: false }), { status: 201 }
    )));
    expect(await new LocalApiClient().send(event)).toBe("duplicate");
  });

  it("does not retain a server error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "sensitive server details", { status: 500 }
    )));
    await expect(new LocalApiClient().send(event)).rejects.toThrow(
      "local API returned 500"
    );
  });
});
