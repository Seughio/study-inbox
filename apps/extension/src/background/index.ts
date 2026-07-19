import { BackgroundController } from "./controller";
import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { installDeepSeekContentScriptRegistration } from "./deepseek-content-registration";
import { RETRY_ALARM_NAME, RetryScheduler } from "./retry-scheduler";

const controller = new BackgroundController();
const retryScheduler = new RetryScheduler(controller);
installDeepSeekContentScriptRegistration();
void retryScheduler.initialize();

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

chrome.runtime.onStartup.addListener(() => void retryScheduler.initialize());
chrome.runtime.onInstalled.addListener(() => void retryScheduler.initialize());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM_NAME) void retryScheduler.handleAlarm(alarm.name);
});

async function handleRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  try {
    switch (request.type) {
      case "SUBMIT_EVENT":
      {
        const outcome = await controller.submit(request.event);
        if (outcome === "queued") await retryScheduler.flushAfterEnqueue();
        else if (outcome !== "paused") await retryScheduler.flush();
        return { ok: true, outcome };
      }
      case "GET_STATUS":
        return { ok: true, status: await controller.getStatus() };
      case "SET_ENABLED":
        await controller.setEnabled(request.enabled);
        return { ok: true };
      case "RETRY_QUEUE":
        await retryScheduler.flush();
        return { ok: true };
    }
  } catch {
    return { ok: false, error: "local extension operation failed" };
  }
}
