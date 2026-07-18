import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import {
  ChromeReconBrowserPort,
  DeepSeekReconController
} from "../recon/controller";
import {
  renderSelectionPreview,
  type ReconPreviewElements
} from "./recon-preview";

const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const service = document.querySelector<HTMLElement>("#service")!;
const lastSend = document.querySelector<HTMLElement>("#last-send")!;
const retryCount = document.querySelector<HTMLElement>("#retry-count")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
const message = document.querySelector<HTMLElement>("#message")!;
const reconMode = document.querySelector<HTMLInputElement>("#recon-mode")!;
const reconAuthorize = document.querySelector<HTMLButtonElement>("#recon-authorize")!;
const reconInspect = document.querySelector<HTMLButtonElement>("#recon-inspect")!;
const reconSelect = document.querySelector<HTMLButtonElement>("#recon-select")!;
const reconRead = document.querySelector<HTMLButtonElement>("#recon-read")!;
const reconReselect = document.querySelector<HTMLButtonElement>("#recon-reselect")!;
const reconClear = document.querySelector<HTMLButtonElement>("#recon-clear")!;
const reconOutput = document.querySelector<HTMLTextAreaElement>("#recon-output")!;
const reconMessage = document.querySelector<HTMLElement>("#recon-message")!;
const reconPreview: ReconPreviewElements = {
  panel: document.querySelector<HTMLElement>("#recon-preview")!,
  node: document.querySelector<HTMLElement>("#recon-node")!,
  classes: document.querySelector<HTMLElement>("#recon-classes")!,
  textLength: document.querySelector<HTMLElement>("#recon-text-length")!,
  htmlLength: document.querySelector<HTMLElement>("#recon-html-length")!,
  childCount: document.querySelector<HTMLElement>("#recon-child-count")!,
  selectedAt: document.querySelector<HTMLElement>("#recon-selected-at")!,
  sourceDomain: document.querySelector<HTMLElement>("#recon-source-domain")!,
  warning: document.querySelector<HTMLElement>("#recon-warning")!,
  debug: document.querySelector<HTMLTextAreaElement>("#recon-debug")!
};
const reconController = new DeepSeekReconController(new ChromeReconBrowserPort());
const reconModeStorageKey = "deepSeekReconDeveloperMode";

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

function setReconControls(enabled: boolean): void {
  for (const button of [
    reconAuthorize,
    reconInspect,
    reconSelect,
    reconRead,
    reconReselect,
    reconClear
  ]) {
    button.disabled = !enabled;
  }
  if (!enabled) {
    reconOutput.value = "";
    reconMessage.textContent = "侦察工具未启用";
    renderSelectionPreview(null, reconPreview);
  }
}

function describeReconFailure(reason: string): string {
  const descriptions: Record<string, string> = {
    disabled: "请先主动启用侦察开发模式",
    "permission-denied": "尚未授予可选 DeepSeek 页面权限",
    "wrong-page": "当前标签页不是 chat.deepseek.com",
    "execution-failed": "页面注入失败，请检查授权和当前页面"
  };
  return descriptions[reason] ?? "侦察操作失败";
}

async function refreshSelectedNode(): Promise<void> {
  const result = await reconController.getSelectedNodeSummary();
  if (!result.ok) {
    renderSelectionPreview(null, reconPreview);
    reconMessage.textContent = describeReconFailure(result.reason);
    return;
  }
  renderSelectionPreview(result.value, reconPreview);
  if (result.value) reconMessage.textContent = "已从当前页面内存读取节点摘要（不含正文）";
}

async function startNodeSelection(): Promise<void> {
  if (!confirm(
    "隐私警告：将进入单节点选择模式。请只在全新脱敏对话中操作。移动鼠标查看高亮，滚轮或方向键切换父子节点，Enter/左键确认，Escape 取消。是否继续？"
  )) return;
  const result = await reconController.armSelection();
  reconMessage.textContent = result.ok
    ? "已进入选择模式：悬停查看高亮，向上扩大，向下缩小"
    : describeReconFailure(result.reason);
}

reconMode.addEventListener("change", () => {
  void (async () => {
    if (reconMode.checked) {
      reconController.setDeveloperMode(true);
      setReconControls(true);
      await chrome.storage.session.set({ [reconModeStorageKey]: true });
      await refreshSelectedNode();
      return;
    }
    await reconController.cancelSelection();
    reconController.setDeveloperMode(false);
    setReconControls(false);
    await chrome.storage.session.set({ [reconModeStorageKey]: false });
  })();
});
reconAuthorize.addEventListener("click", () => {
  void reconController.requestPermission().then((granted) => {
    reconMessage.textContent = granted ? "可选页面权限已授权" : "用户未授权";
  });
});
reconInspect.addEventListener("click", () => {
  void reconController.inspect().then((result) => {
    if (!result.ok) {
      reconMessage.textContent = describeReconFailure(result.reason);
      return;
    }
    reconOutput.value = JSON.stringify(result.value, null, 2);
    reconMessage.textContent = "仅结构快照已生成；未输出消息正文";
  });
});
reconSelect.addEventListener("click", () => void startNodeSelection());
reconReselect.addEventListener("click", () => void startNodeSelection());
reconRead.addEventListener("click", () => {
  if (!confirm(
    "隐私警告：即将显示未脱敏的单个节点 HTML。禁止直接提交到仓库，必须先运行本地脱敏脚本并人工复核。"
  )) return;
  void reconController.readSelectedNodeHtml().then((result) => {
    if (!result.ok) {
      reconMessage.textContent = describeReconFailure(result.reason);
      return;
    }
    reconOutput.value = result.value ?? "";
    reconMessage.textContent = result.value
      ? "待脱敏 HTML 已显示，但未保存到 storage 或文件"
      : "页面内存中没有已选择节点";
  });
});
reconClear.addEventListener("click", () => {
  void reconController.clearSelectedNode().then(async (result) => {
    if (!result.ok) {
      reconMessage.textContent = describeReconFailure(result.reason);
      return;
    }
    reconOutput.value = "";
    await refreshSelectedNode();
    reconMessage.textContent = "已清除页面内存中的节点和原始 HTML";
  });
});
setReconControls(false);
void chrome.storage.session.get(reconModeStorageKey).then(async (stored) => {
  const restored = stored[reconModeStorageKey] === true;
  reconMode.checked = restored;
  reconController.setDeveloperMode(restored);
  setReconControls(restored);
  if (restored) await refreshSelectedNode();
});
