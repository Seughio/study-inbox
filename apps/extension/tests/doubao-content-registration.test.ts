import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOUBAO_CONTENT_MATCH,
  DOUBAO_CONTENT_ORIGIN,
  DOUBAO_CONTENT_SCRIPT_ID,
  syncDoubaoContentScriptRegistration
} from "../src/background/doubao-content-registration";

afterEach(() => vi.unstubAllGlobals());

function stubChrome(granted: boolean, registered: boolean): {
  register: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
} {
  const register = vi.fn(async () => undefined);
  const unregister = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn(async () => granted) },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () =>
        registered ? [{ id: DOUBAO_CONTENT_SCRIPT_ID }] : []
      ),
      registerContentScripts: register,
      unregisterContentScripts: unregister
    }
  });
  return { register, unregister };
}

describe("Doubao dynamic content registration", () => {
  it("does not register without the optional host permission", async () => {
    const { register } = stubChrome(false, false);
    await syncDoubaoContentScriptRegistration();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers only the confirmed ordinary chat path after permission", async () => {
    const { register } = stubChrome(true, false);
    await syncDoubaoContentScriptRegistration();
    expect(register).toHaveBeenCalledWith([expect.objectContaining({
      id: DOUBAO_CONTENT_SCRIPT_ID,
      matches: [DOUBAO_CONTENT_MATCH],
      js: ["content/index.js"],
      persistAcrossSessions: true
    })]);
    expect(DOUBAO_CONTENT_ORIGIN).toBe("https://www.doubao.com/*");
    expect(DOUBAO_CONTENT_MATCH).toBe("https://www.doubao.com/chat/*");
    expect(DOUBAO_CONTENT_MATCH).not.toContain("*.doubao.com");
    expect(DOUBAO_CONTENT_MATCH).not.toBe(DOUBAO_CONTENT_ORIGIN);
  });

  it("unregisters after permission is revoked", async () => {
    const { unregister } = stubChrome(false, true);
    await syncDoubaoContentScriptRegistration();
    expect(unregister).toHaveBeenCalledWith({ ids: [DOUBAO_CONTENT_SCRIPT_ID] });
  });
});
