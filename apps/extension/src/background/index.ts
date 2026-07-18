import { BackgroundController } from "./controller";
import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { installDeepSeekContentScriptRegistration } from "./deepseek-content-registration";

const controller = new BackgroundController();
installDeepSeekContentScriptRegistration();

chrome.runtime.onMessage.addListener(
  (
    request: RuntimeRequest,
    _sender,
    sendResponse: (response: RuntimeResponse) => void
  ) => {
    void handleRequest(request).then(sendResponse);
    return true;
  }
);

chrome.runtime.onStartup.addListener(() => void controller.retry());
chrome.runtime.onInstalled.addListener(() => void controller.retry());

async function handleRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  try {
    switch (request.type) {
      case "SUBMIT_EVENT":
        return { ok: true, outcome: await controller.submit(request.event) };
      case "GET_STATUS":
        return { ok: true, status: await controller.getStatus() };
      case "SET_ENABLED":
        await controller.setEnabled(request.enabled);
        return { ok: true };
      case "RETRY_QUEUE":
        await controller.retry();
        return { ok: true };
    }
  } catch {
    return { ok: false, error: "local extension operation failed" };
  }
}
