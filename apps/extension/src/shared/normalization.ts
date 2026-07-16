/**
 * Stable identity normalization:
 * - CRLF and CR become LF;
 * - horizontal whitespace on each line collapses to one space;
 * - leading/trailing whitespace on each line is removed;
 * - leading/trailing blank lines are removed;
 * - three or more newlines collapse to two.
 */
export function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}
