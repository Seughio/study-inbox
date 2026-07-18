import type { TurnSnapshot } from "../adapters/types";
import { createConversationEvent, sha256Hex } from "../shared/event";
import { normalizeText } from "../shared/normalization";

export const DEEPSEEK_SUPPRESSED_TURNS_KEY = "deepseekSuppressedTurnIds";
export const DEFAULT_SUPPRESSED_TURN_LIMIT = 500;

export interface SuppressionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface DeepSeekSuppressionRegistry {
  suppress(snapshot: TurnSnapshot): Promise<void>;
  isSuppressed(snapshot: TurnSnapshot): Promise<boolean>;
}

interface SuppressionIds {
  turn: string;
  event: string;
}

export class DeepSeekSuppressionStore implements DeepSeekSuppressionRegistry {
  public constructor(
    private readonly conversationId: string,
    private readonly storage: SuppressionStorage = chrome.storage.local,
    private readonly limit = DEFAULT_SUPPRESSED_TURN_LIMIT
  ) {
    if (limit < 1) throw new Error("suppressed turn limit must be positive");
  }

  public async suppress(snapshot: TurnSnapshot): Promise<void> {
    const ids = await this.identifiers(snapshot);
    if (snapshot.state === "streaming") {
      await this.remember([ids.turn]);
    } else {
      await this.remember([ids.event], [ids.turn]);
    }
  }

  public async isSuppressed(snapshot: TurnSnapshot): Promise<boolean> {
    const ids = await this.identifiers(snapshot);
    const entries = await this.load();
    if (entries.includes(ids.event)) {
      await this.remember([ids.event]);
      return true;
    }
    if (!entries.includes(ids.turn)) return false;
    if (snapshot.state === "streaming") {
      await this.remember([ids.turn]);
    } else {
      await this.remember([ids.event], [ids.turn]);
    }
    return true;
  }

  private async identifiers(snapshot: TurnSnapshot): Promise<SuppressionIds> {
    const question = normalizeText(snapshot.question);
    const answer = normalizeText(snapshot.answer);
    const event = await createConversationEvent({
      source: "deepseek",
      conversationId: this.conversationId,
      question,
      answer
    });
    return {
      turn: `turn:${await sha256Hex(JSON.stringify([
        "deepseek",
        snapshot.key,
        question
      ]))}`,
      event: `event:${event.event_id}`
    };
  }

  private async load(): Promise<string[]> {
    const result = await this.storage.get(DEEPSEEK_SUPPRESSED_TURNS_KEY);
    const stored = result[DEEPSEEK_SUPPRESSED_TURNS_KEY];
    const entries = Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === "string")
      : [];
    return entries.slice(-this.limit);
  }

  private async remember(ids: string[], remove: string[] = []): Promise<void> {
    const entries = await this.load();
    const refreshed = entries.filter(
      (entry) => !ids.includes(entry) && !remove.includes(entry)
    );
    refreshed.push(...ids);
    await this.storage.set({
      [DEEPSEEK_SUPPRESSED_TURNS_KEY]: refreshed.slice(-this.limit)
    });
  }
}
