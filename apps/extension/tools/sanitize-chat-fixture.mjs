import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

const SYNTHETIC_USER_TEXT = "请解释合成测试中的热力学第一定律。";
const SYNTHETIC_ASSISTANT_TEXT = "在合成测试中，热力学第一定律表示能量守恒。";
const REMOVED_ELEMENTS = "script, style, svg, img, picture, source";
const SENSITIVE_ATTRIBUTE =
  /(?:account|email|file(?:name)?|conversation[-_]?id|chat[-_]?id|thread[-_]?id|user[-_]?id|token)/i;
const DETECTORS = [
  { name: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  { name: "phone", expression: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/u },
  {
    name: "url-token",
    expression:
      /https?:\/\/[^\s"'<>]*(?:[?&](?:token|access_token|auth|key|signature)=|\/[A-Za-z0-9_-]{24,})/iu
  },
  {
    name: "long-random-string",
    expression: /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/u
  },
  {
    name: "filename",
    expression: /\b[^\s<>"']{1,80}\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|gif)\b/iu
  }
];

function countStructure(document) {
  return {
    elements: document.querySelectorAll("*").length,
    scripts: document.querySelectorAll("script").length,
    styles: document.querySelectorAll("style").length,
    media: document.querySelectorAll("svg, img, picture, source").length,
    eventAttributes: [...document.querySelectorAll("*")].reduce(
      (count, element) =>
        count + [...element.attributes].filter((attribute) => /^on/i.test(attribute.name)).length,
      0
    ),
    inlineStyleAttributes: document.querySelectorAll("[style]").length
  };
}

function replaceTextPreservingStructure(element, replacement, window) {
  const walker = element.ownerDocument.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current);
    current = walker.nextNode();
  }
  if (textNodes.length === 0) {
    element.append(element.ownerDocument.createTextNode(replacement));
    return;
  }
  textNodes.forEach((node, index) => {
    node.textContent = index === 0 ? replacement : "";
  });
}

function cleanHref(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    url.search = "";
    return url.toString();
  } catch {
    return value.split("?")[0];
  }
}

export function detectSensitiveContent(html) {
  return DETECTORS.filter(({ expression }) => expression.test(html)).map(({ name }) => name);
}

function detectSensitiveFindings(document, window) {
  const findings = [];

  function inspect(value, element, attributeName = null) {
    for (const { name, expression } of DETECTORS) {
      if (attributeName === "class" && name === "long-random-string") continue;
      if (expression.test(value)) {
        findings.push({
          type: name,
          tagName: element.tagName.toLowerCase(),
          attributeName
        });
      }
    }
  }

  const walker = document.createTreeWalker(document.documentElement, window.NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    const parent = textNode.parentElement;
    if (parent && textNode.textContent) inspect(textNode.textContent, parent);
    textNode = walker.nextNode();
  }
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      inspect(attribute.value, element, attribute.name.toLowerCase());
    });
  });
  return findings;
}

function anonymizeDocumentAttributes(document) {
  const definitions = {
    "data-observe-row": { prefix: "synthetic-observe-row", values: new Map() },
    "data-message-id": { prefix: "synthetic-message", values: new Map() }
  };
  const counts = { "data-observe-row": 0, "data-message-id": 0 };
  document.querySelectorAll("*").forEach((element) => {
    for (const [attributeName, definition] of Object.entries(definitions)) {
      if (!element.hasAttribute(attributeName)) continue;
      const original = element.getAttribute(attributeName) ?? "";
      let replacement = definition.values.get(original);
      if (!replacement) {
        replacement = `${definition.prefix}-${definition.values.size + 1}`;
        definition.values.set(original, replacement);
      }
      element.setAttribute(attributeName, replacement);
      counts[attributeName] += 1;
    }
  });
  return counts;
}

export function sanitizeChatHtml(rawHtml, options) {
  if (!options?.userSelector || !options?.assistantSelector) {
    throw new Error("必须显式提供已人工确认的用户节点和助手节点选择器。反猜测选择器被禁止。");
  }
  const dom = new JSDOM(rawHtml, { url: "https://fixture.invalid/" });
  const { document } = dom.window;
  const before = countStructure(document);
  const userNodes = [...document.querySelectorAll(options.userSelector)];
  const assistantNodes = [...document.querySelectorAll(options.assistantSelector)];
  if (userNodes.length === 0 || assistantNodes.length === 0) {
    throw new Error("已确认的消息选择器没有同时匹配用户和助手节点，拒绝生成 fixture。");
  }

  document.querySelectorAll(REMOVED_ELEMENTS).forEach((element) => element.remove());
  const anonymizedAttributes = anonymizeDocumentAttributes(document);
  document.querySelectorAll("*").forEach((element) => {
    let hasSensitiveAttribute = false;
    [...element.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
      } else if (attribute.name.toLowerCase() === "style") {
        element.removeAttribute(attribute.name);
      } else if (attribute.name.toLowerCase() === "href") {
        element.setAttribute("href", cleanHref(attribute.value, document.baseURI));
      } else if (SENSITIVE_ATTRIBUTE.test(attribute.name)) {
        element.setAttribute(attribute.name, "[REDACTED]");
        hasSensitiveAttribute = true;
      }
    });
    if (hasSensitiveAttribute) {
      [...element.childNodes]
        .filter((node) => node.nodeType === dom.window.Node.TEXT_NODE)
        .forEach((node) => {
          node.textContent = "";
        });
    }
  });

  userNodes.forEach((node) => replaceTextPreservingStructure(node, SYNTHETIC_USER_TEXT, dom.window));
  assistantNodes.forEach((node) =>
    replaceTextPreservingStructure(node, SYNTHETIC_ASSISTANT_TEXT, dom.window)
  );

  const html = dom.serialize();
  const sensitiveFindings = detectSensitiveFindings(document, dom.window);
  const findings = [...new Set(sensitiveFindings.map(({ type }) => type))];
  const after = countStructure(document);
  return {
    html,
    findings,
    report: {
      before,
      after,
      anonymizedAttributes,
      matchedMessageNodes: { user: userNodes.length, assistant: assistantNodes.length },
      removed: {
        elements: before.elements - after.elements,
        scripts: before.scripts - after.scripts,
        styles: before.styles - after.styles,
        media: before.media - after.media,
        eventAttributes: before.eventAttributes - after.eventAttributes,
        inlineStyleAttributes: before.inlineStyleAttributes - after.inlineStyleAttributes
      },
      sensitiveFindingTypes: findings,
      sensitiveFindings
    }
  };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("参数格式错误。每个 --参数 后必须有值。");
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function sanitizeFixtureFile({ input, output, userSelector, assistantSelector }) {
  const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);
  if (isInside(inputPath, repositoryDirectory)) {
    throw new Error("原始 HTML 不得放入 Git 仓库；请从仓库外的临时位置读取。");
  }
  const rawHtml = await readFile(inputPath, "utf8");
  const result = sanitizeChatHtml(rawHtml, { userSelector, assistantSelector });
  if (result.findings.length > 0) {
    const locations = [...new Set(result.report.sensitiveFindings.map((finding) => {
      const context = finding.attributeName ? `属性 ${finding.attributeName}` : "文本";
      return `${finding.type} 位于 <${finding.tagName}> ${context}`;
    }))];
    throw new Error(
      `发现疑似敏感内容（${result.findings.join(", ")}）：${locations.join("；")}。未生成最终 fixture。`
    );
  }
  await writeFile(outputPath, result.html, { encoding: "utf8", flag: "wx" });
  await writeFile(`${outputPath}.report.json`, `${JSON.stringify(result.report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
  return result.report;
}

export async function runSanitizerCli(argv, executable = "sanitize-chat-fixture.mjs") {
  const args = parseArguments(argv);
  if (!args.input || !args.output || !args["user-selector"] || !args["assistant-selector"]) {
    throw new Error(
      `用法：node tools/${executable} --input <仓库外原始HTML> --output <fixture> --user-selector <已确认选择器> --assistant-selector <已确认选择器>`
    );
  }
  const report = await sanitizeFixtureFile({
    input: args.input,
    output: args.output,
    userSelector: args["user-selector"],
    assistantSelector: args["assistant-selector"]
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runSanitizerCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
