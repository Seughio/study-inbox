export const DOUBAO_CONTENT_SCRIPT_ID = "study-inbox-doubao-adapter";
export const DOUBAO_CONTENT_ORIGIN = "https://www.doubao.com/*";
export const DOUBAO_CONTENT_MATCH = "https://www.doubao.com/chat/*";

export async function syncDoubaoContentScriptRegistration(): Promise<void> {
  const [granted, registrations] = await Promise.all([
    chrome.permissions.contains({ origins: [DOUBAO_CONTENT_ORIGIN] }),
    chrome.scripting.getRegisteredContentScripts({ ids: [DOUBAO_CONTENT_SCRIPT_ID] })
  ]);
  const registered = registrations.length > 0;
  if (granted && !registered) {
    await chrome.scripting.registerContentScripts([{
      id: DOUBAO_CONTENT_SCRIPT_ID,
      matches: [DOUBAO_CONTENT_MATCH],
      js: ["content/index.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }]);
  } else if (!granted && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [DOUBAO_CONTENT_SCRIPT_ID] });
  }
}

export function installDoubaoContentScriptRegistration(): void {
  const sync = (): void => {
    void syncDoubaoContentScriptRegistration().catch(() => undefined);
  };
  chrome.permissions.onAdded.addListener(sync);
  chrome.permissions.onRemoved.addListener(sync);
  sync();
}
