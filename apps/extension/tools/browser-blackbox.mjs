import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const phase = process.argv[2] ?? "online";
const debugOrigin = "http://127.0.0.1:9222";
const apiOrigin = "http://127.0.0.1:8765";
const fixtureUrl = "http://127.0.0.1:4173/";
const extensionRoot = resolve(import.meta.dirname, "..");
const markdownDirectory = resolve(extensionRoot, "..", "..", ".milestone-2a-data", "markdown");

class Cdp {
  #id = 0;
  #pending = new Map();
  constructor(url) {
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolveReady, reject) => {
      this.socket.addEventListener("open", resolveReady, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.#id;
    const result = new Promise((resolveResult, reject) => {
      this.#pending.set(id, { resolve: resolveResult, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  close() { this.socket.close(); }
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
async function waitFor(action, description, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await action();
    if (value) return value;
    await sleep(200);
  }
  throw new Error(`等待超时：${description}`);
}
async function targets() {
  const response = await fetch(`${debugOrigin}/json/list`);
  return response.json();
}
async function connectTarget(predicate, description) {
  const target = await waitFor(async () => (await targets()).find(predicate), description);
  return new Cdp(target.webSocketDebuggerUrl);
}
async function records() {
  const response = await fetch(`${apiOrigin}/api/v1/conversations`);
  if (!response.ok) throw new Error(`API records ${response.status}`);
  return response.json();
}
async function storage(worker) {
  return worker.evaluate(`new Promise((resolve) => chrome.storage.local.get(null, resolve))`);
}
async function click(page, scenario) {
  await page.evaluate(`document.querySelector('button[data-scenario="${scenario}"]').click()`);
}

const page = await connectTarget(
  (target) => target.type === "page" && target.url.startsWith(fixtureUrl),
  "模拟页面"
);
let worker;

async function connectWorker() {
  return connectTarget(
    (target) => target.type === "service_worker" && target.url.includes("background/index.js"),
    "扩展 service worker"
  );
}

async function openPopupFromWorker() {
  const target = await waitFor(
    async () => (await targets()).find(
      (candidate) => candidate.type === "service_worker" && candidate.url.includes("background/index.js")
    ),
    "扩展 service worker"
  );
  const extensionId = new URL(target.url).hostname;
  const response = await fetch(
    `${debugOrigin}/json/new?${encodeURIComponent(`chrome-extension://${extensionId}/popup/index.html`)}`,
    { method: "PUT" }
  );
  const popupTarget = await response.json();
  return new Cdp(popupTarget.webSocketDebuggerUrl);
}

try {
  if (phase === "online") {
    const before = (await records()).length;
    await click(page, "streaming");
    await sleep(400);
    if ((await records()).length !== before) throw new Error("流式过程中提前发送");
    await waitFor(async () => (await records()).length === before + 1, "流式完成后写入");
    worker = await connectWorker();
    console.log("[通过] 流式期间未发送，完成后发送一次");

    await click(page, "streaming");
    await waitFor(async () => (await storage(worker)).lastSendStatus === "duplicate", "重复响应");
    if ((await records()).length !== before + 1) throw new Error("重复事件写入数据库");
    console.log("[通过] 相同问答返回 duplicate，数据库未重复写入");

    await click(page, "non-learning");
    await waitFor(async () => (await records()).length === before + 2, "非学习记录写入");
    const exportResponse = await fetch(`${apiOrigin}/api/v1/export/markdown`, { method: "POST" });
    if (!exportResponse.ok) throw new Error("Markdown 导出失败");
    const files = await readdir(markdownDirectory);
    const markdown = (await Promise.all(
      files.filter((file) => file.endsWith(".md")).map((file) =>
        readFile(resolve(markdownDirectory, file), "utf8")
      )
    )).join("\n");
    if (!markdown.includes("热力学第一定律")) throw new Error("缺少学习内容");
    if (markdown.includes("今天午餐")) throw new Error("非学习内容被导出");
    console.log("[通过] Markdown 包含学习内容且排除非学习内容");
  } else if (phase === "offline") {
    await click(page, "code");
    worker = await connectWorker();
    await waitFor(async () => ((await storage(worker)).retryQueue?.length ?? 0) >= 1, "离线入队");
    console.log("[通过] API 离线时事件进入重试队列");
  } else if (phase === "retry") {
    worker = await connectWorker();
    const popup = await openPopupFromWorker();
    await waitFor(
      () => popup.evaluate(`Boolean(document.querySelector("#retry"))`),
      "popup 重试按钮"
    );
    await popup.evaluate(`document.querySelector("#retry").click(); true`);
    await waitFor(async () => ((await storage(worker)).retryQueue?.length ?? 0) === 0, "队列恢复");
    await popup.send("Page.close");
    popup.close();
    console.log("[通过] API 恢复后手动重试成功");
  } else if (phase === "pause") {
    worker = await connectWorker();
    const before = (await records()).length;
    const queued = (await storage(worker)).retryQueue?.length ?? 0;
    await worker.evaluate(`new Promise((resolve) => chrome.storage.local.set({enabled:false}, resolve))`);
    await click(page, "table");
    await sleep(1800);
    if ((await records()).length !== before) throw new Error("暂停后仍写入 API");
    if (((await storage(worker)).retryQueue?.length ?? 0) !== queued) throw new Error("暂停后仍写入队列");
    await worker.evaluate(`new Promise((resolve) => chrome.storage.local.set({enabled:true}, resolve))`);
    console.log("[通过] 暂停状态不采集、不保存、不发送");
  } else {
    throw new Error(`未知 phase: ${phase}`);
  }
} finally {
  page.close();
  worker?.close();
}
