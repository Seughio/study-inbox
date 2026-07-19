import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalApiClient } from "../src/background/api-client";
import { BackgroundController } from "../src/background/controller";
import type { ConversationEvent } from "../src/shared/contracts";
import { ChromeLocalStore } from "../src/storage/local-store";
import { RetryQueue } from "../src/storage/retry-queue";

const event: ConversationEvent = {
  event_id: "persistent-offline-event",
  source: "deepseek",
  conversation_id: "deepseek-page",
  question: "合成离线问题",
  answer: "合成离线回答",
  captured_at: "2026-07-18T00:00:00.000Z"
};

function installMemoryChromeStorage(): Record<string, unknown> {
  const values: Record<string, unknown> = { enabled: true };
  const local = {
    get: vi.fn(async (keys: string | string[]) => {
      const selected = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(selected.map((key) => [key, values[key]]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    })
  };
  vi.stubGlobal("chrome", { storage: { local } } as unknown as typeof chrome);
  return values;
}

function createController(): BackgroundController {
  const store = new ChromeLocalStore();
  return new BackgroundController(store, new LocalApiClient(), new RetryQueue(store));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("background persistent retry path", () => {
  it("persists the complete event and queued state after a network failure", async () => {
    const values = installMemoryChromeStorage();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(
      new TypeError("Failed to fetch")
    ));

    expect(await createController().submit(event)).toBe("queued");
    expect(values.retryQueue).toEqual([event]);
    expect(values.lastSendStatus).toBe("queued");
    expect(values.lastError).toBe("local service unavailable");
  });

  it("persists retryable HTTP errors and survives controller reconstruction", async () => {
    const values = installMemoryChromeStorage();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response("unavailable", { status: 503 })
    ));

    expect(await createController().submit(event)).toBe("queued");
    expect(await createController().submit(event)).toBe("queued");
    expect(values.retryQueue).toEqual([event]);
    expect(values.lastSendStatus).toBe("queued");
    expect(values.lastError).toBe("local API returned 503");
  });

  it("does not enqueue a successful send and clears stale error state", async () => {
    const values = installMemoryChromeStorage();
    values.lastError = "old failure";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ created: true }), { status: 201 })
    ));

    expect(await createController().submit(event)).toBe("sent");
    expect(values.retryQueue).toBeUndefined();
    expect(values.lastSendStatus).toBe("sent");
    expect(values.lastError).toBeNull();
  });
});
