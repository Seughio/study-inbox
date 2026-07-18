import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEEPSEEK_CONTENT_ORIGIN,
  DEEPSEEK_CONTENT_SCRIPT_ID,
  syncDeepSeekContentScriptRegistration
} from "../src/background/deepseek-content-registration";

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
      getRegisteredContentScripts: vi.fn(async () => registered ? [{ id: DEEPSEEK_CONTENT_SCRIPT_ID }] : []),
      registerContentScripts: register,
      unregisterContentScripts: unregister
    }
  });
  return { register, unregister };
}

describe("DeepSeek dynamic content registration", () => {
  it("does not register when optional host permission is absent", async () => {
    const { register } = stubChrome(false, false);
    await syncDeepSeekContentScriptRegistration();
    expect(register).not.toHaveBeenCalled();
  });

  it("registers only the reviewed DeepSeek origin after permission", async () => {
    const { register } = stubChrome(true, false);
    await syncDeepSeekContentScriptRegistration();
    expect(register).toHaveBeenCalledWith([expect.objectContaining({
      id: DEEPSEEK_CONTENT_SCRIPT_ID,
      matches: [DEEPSEEK_CONTENT_ORIGIN],
      js: ["content/index.js"]
    })]);
  });

  it("unregisters when optional permission is removed", async () => {
    const { unregister } = stubChrome(false, true);
    await syncDeepSeekContentScriptRegistration();
    expect(unregister).toHaveBeenCalledWith({ ids: [DEEPSEEK_CONTENT_SCRIPT_ID] });
  });
});
