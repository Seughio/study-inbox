import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";

const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const service = document.querySelector<HTMLElement>("#service")!;
const lastSend = document.querySelector<HTMLElement>("#last-send")!;
const retryCount = document.querySelector<HTMLElement>("#retry-count")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
const message = document.querySelector<HTMLElement>("#message")!;

async function send(request: RuntimeRequest): Promise<RuntimeResponse> {
  return chrome.runtime.sendMessage(request) as Promise<RuntimeResponse>;
}

async function refresh(): Promise<void> {
  const response = await send({ type: "GET_STATUS" });
  if (!response.ok || !("status" in response)) {
    message.textContent = "状态读取失败";
    return;
  }
  enabled.checked = response.status.enabled;
  service.textContent = response.status.serviceOnline ? "在线" : "离线";
  lastSend.textContent = response.status.lastSendStatus;
  retryCount.textContent = String(response.status.retryCount);
}

enabled.addEventListener("change", () => {
  void send({ type: "SET_ENABLED", enabled: enabled.checked }).then(refresh);
});
retry.addEventListener("click", () => {
  retry.disabled = true;
  message.textContent = "正在重试…";
  void send({ type: "RETRY_QUEUE" }).then(async () => {
    message.textContent = "重试完成";
    retry.disabled = false;
    await refresh();
  });
});
void refresh();
