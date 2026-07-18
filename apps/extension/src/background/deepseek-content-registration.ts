export const DEEPSEEK_CONTENT_SCRIPT_ID = "study-inbox-deepseek-adapter";
export const DEEPSEEK_CONTENT_ORIGIN = "https://chat.deepseek.com/*";

export async function syncDeepSeekContentScriptRegistration(): Promise<void> {
  const [granted, registrations] = await Promise.all([
    chrome.permissions.contains({ origins: [DEEPSEEK_CONTENT_ORIGIN] }),
    chrome.scripting.getRegisteredContentScripts({ ids: [DEEPSEEK_CONTENT_SCRIPT_ID] })
  ]);
  const registered = registrations.length > 0;
  if (granted && !registered) {
    await chrome.scripting.registerContentScripts([{
      id: DEEPSEEK_CONTENT_SCRIPT_ID,
      matches: [DEEPSEEK_CONTENT_ORIGIN],
      js: ["content/index.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }]);
  } else if (!granted && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [DEEPSEEK_CONTENT_SCRIPT_ID] });
  }
}

export function installDeepSeekContentScriptRegistration(): void {
  const sync = (): void => {
    void syncDeepSeekContentScriptRegistration().catch(() => undefined);
  };
  chrome.permissions.onAdded.addListener(sync);
  chrome.permissions.onRemoved.addListener(sync);
  sync();
}
