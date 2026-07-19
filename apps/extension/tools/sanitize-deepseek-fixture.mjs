import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  detectSensitiveContent,
  runSanitizerCli,
  sanitizeChatHtml,
  sanitizeFixtureFile
} from "./sanitize-chat-fixture.mjs";

export { detectSensitiveContent, sanitizeFixtureFile };
export const sanitizeDeepSeekHtml = sanitizeChatHtml;

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = path.resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runSanitizerCli(process.argv.slice(2), "sanitize-deepseek-fixture.mjs").catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
