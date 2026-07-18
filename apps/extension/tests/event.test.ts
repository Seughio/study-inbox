import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import schema from "../../../contracts/conversation-event.schema.json";
import { createConversationEvent } from "../src/shared/event";
import { normalizeText } from "../src/shared/normalization";

describe("conversation event", () => {
  it("normalizes newline, edge whitespace, and repeated spaces", () => {
    expect(normalizeText("  first  line\r\n\r\n\r\n second\tline  "))
      .toBe("first line\n\nsecond line");
  });

  it("keeps a stable event id across refresh and DOM rebuild", async () => {
    const first = await createConversationEvent({
      source: "local-fixture",
      conversationId: "stable-conversation",
      question: " 数学   问题 ",
      answer: "函数\r\n回答",
      capturedAt: "2026-01-01T00:00:00Z"
    });
    const rebuilt = await createConversationEvent({
      source: "local-fixture",
      conversationId: "stable-conversation",
      question: "数学 问题",
      answer: "函数\n回答",
      capturedAt: "2026-02-01T00:00:00Z"
    });
    expect(first.event_id).toBe(rebuilt.event_id);
    expect(first.event_id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("matches the shared JSON Schema", async () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const event = await createConversationEvent({
      source: "local-fixture",
      conversationId: "schema-fixture",
      question: "物理中的热力学是什么？",
      answer: "热力学研究热量、功和能量转换。"
    });
    expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
  });

  it("accepts a DeepSeek event in the shared JSON Schema", async () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const event = await createConversationEvent({
      source: "deepseek",
      conversationId: "deepseek-page",
      question: "合成物理问题",
      answer: "合成物理回答"
    });
    expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
  });
});
