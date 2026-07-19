import {
  ChromeReconBrowserPort,
  DeepSeekReconController,
  DoubaoReconController,
  type SiteReconController
} from "../recon/controller";
import type { RuntimeRequest, RuntimeResponse } from "../shared/messages";
import { renderSelectionPreview, type ReconPreviewElements } from "./recon-preview";

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

interface ReconPanelConfig {
  prefix: "deepseek" | "doubao";
  label: string;
  expectedPage: string;
  storageKey: string;
  controller: SiteReconController;
}

function element<T extends Element>(prefix: string, suffix: string): T {
  return document.querySelector<T>(`#${prefix}-recon-${suffix}`)!;
}

function bindReconPanel(config: ReconPanelConfig): void {
  const { prefix, label, expectedPage, storageKey, controller } = config;
  const mode = element<HTMLInputElement>(prefix, "mode");
  const authorize = element<HTMLButtonElement>(prefix, "authorize");
  const revoke = element<HTMLButtonElement>(prefix, "revoke");
  const inspect = element<HTMLButtonElement>(prefix, "inspect");
  const select = element<HTMLButtonElement>(prefix, "select");
  const read = element<HTMLButtonElement>(prefix, "read");
  const reselect = element<HTMLButtonElement>(prefix, "reselect");
  const clear = element<HTMLButtonElement>(prefix, "clear");
  const output = element<HTMLTextAreaElement>(prefix, "output");
  const status = element<HTMLElement>(prefix, "message");
  const preview: ReconPreviewElements = {
    panel: element<HTMLElement>(prefix, "preview"),
    node: element<HTMLElement>(prefix, "node"),
    classes: element<HTMLElement>(prefix, "classes"),
    textLength: element<HTMLElement>(prefix, "text-length"),
    htmlLength: element<HTMLElement>(prefix, "html-length"),
    childCount: element<HTMLElement>(prefix, "child-count"),
    selectedAt: element<HTMLElement>(prefix, "selected-at"),
    sourceDomain: element<HTMLElement>(prefix, "source-domain"),
    warning: element<HTMLElement>(prefix, "warning"),
    debug: element<HTMLTextAreaElement>(prefix, "debug")
  };
  const controls = [authorize, revoke, inspect, select, read, reselect, clear];

  function describeFailure(reason: string): string {
    const descriptions: Record<string, string> = {
      disabled: "请先主动启用侦察开发模式",
      "permission-denied": `尚未授予可选 ${label} 页面权限`,
      "wrong-page": `当前标签页不是受支持的 ${expectedPage}`,
      "execution-failed": "页面注入失败，请检查授权和当前页面"
    };
    return descriptions[reason] ?? "侦察操作失败";
  }

  function setControls(controlsEnabled: boolean): void {
    controls.forEach((button) => {
      button.disabled = !controlsEnabled;
    });
    if (!controlsEnabled) {
      output.value = "";
      status.textContent = "侦察工具未启用";
      renderSelectionPreview(null, preview);
    }
  }

  async function refreshSelectedNode(): Promise<void> {
    const result = await controller.getSelectedNodeSummary();
    if (!result.ok) {
      renderSelectionPreview(null, preview);
      status.textContent = describeFailure(result.reason);
      return;
    }
    renderSelectionPreview(result.value, preview);
    if (result.value) status.textContent = "已从当前页面内存读取节点摘要（不含正文）";
  }

  async function startNodeSelection(): Promise<void> {
    if (!confirm(
      "隐私警告：将进入单节点选择模式。请只在全新脱敏对话中操作。移动鼠标查看高亮，滚轮或方向键切换父子节点，Enter/左键确认，Escape 取消。是否继续？"
    )) return;
    const result = await controller.armSelection();
    status.textContent = result.ok
      ? "已进入选择模式：悬停查看高亮，向上扩大，向下缩小"
      : describeFailure(result.reason);
  }

  mode.addEventListener("change", () => {
    void (async () => {
      if (mode.checked) {
        controller.setDeveloperMode(true);
        setControls(true);
        await chrome.storage.session.set({ [storageKey]: true });
        await refreshSelectedNode();
        return;
      }
      await controller.cancelSelection();
      controller.setDeveloperMode(false);
      setControls(false);
      await chrome.storage.session.set({ [storageKey]: false });
    })();
  });
  authorize.addEventListener("click", () => {
    void controller.requestPermission().then((granted) => {
      status.textContent = granted ? `${label} 可选页面权限已授权` : "用户未授权";
    });
  });
  revoke.addEventListener("click", () => {
    void controller.removePermission().then((removed) => {
      output.value = "";
      renderSelectionPreview(null, preview);
      status.textContent = removed ? `${label} 可选页面权限已撤销` : "权限未授予或未能撤销";
    });
  });
  inspect.addEventListener("click", () => {
    void controller.inspect().then((result) => {
      if (!result.ok) {
        status.textContent = describeFailure(result.reason);
        return;
      }
      output.value = JSON.stringify(result.value, null, 2);
      status.textContent = "仅结构快照已生成；未输出消息正文";
    });
  });
  select.addEventListener("click", () => void startNodeSelection());
  reselect.addEventListener("click", () => void startNodeSelection());
  read.addEventListener("click", () => {
    if (!confirm(
      "隐私警告：即将显示未脱敏的单个节点 HTML。禁止直接提交到仓库，必须先运行本地脱敏脚本并人工复核。"
    )) return;
    void controller.readSelectedNodeHtml().then((result) => {
      if (!result.ok) {
        status.textContent = describeFailure(result.reason);
        return;
      }
      output.value = result.value ?? "";
      status.textContent = result.value
        ? "待脱敏 HTML 已显示，但未保存到 storage 或文件"
        : "页面内存中没有已选择节点";
    });
  });
  clear.addEventListener("click", () => {
    void controller.clearSelectedNode().then(async (result) => {
      if (!result.ok) {
        status.textContent = describeFailure(result.reason);
        return;
      }
      output.value = "";
      await refreshSelectedNode();
      status.textContent = "已清除该站点页面内存中的节点和原始 HTML";
    });
  });

  setControls(false);
  void chrome.storage.session.get(storageKey).then(async (stored) => {
    const restored = stored[storageKey] === true;
    mode.checked = restored;
    controller.setDeveloperMode(restored);
    setControls(restored);
    if (restored) await refreshSelectedNode();
  });
}

bindReconPanel({
  prefix: "deepseek",
  label: "DeepSeek",
  expectedPage: "chat.deepseek.com 页面",
  storageKey: "deepSeekReconDeveloperMode",
  controller: new DeepSeekReconController(new ChromeReconBrowserPort())
});
bindReconPanel({
  prefix: "doubao",
  label: "豆包",
  expectedPage: "www.doubao.com/chat/<conversation-id> 普通对话页",
  storageKey: "doubaoReconDeveloperMode",
  controller: new DoubaoReconController(new ChromeReconBrowserPort())
});
