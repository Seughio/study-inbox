import {
  DEFAULT_SUPPRESSED_TURN_LIMIT,
  TurnSuppressionStore,
  type SuppressionStorage,
  type TurnSuppressionRegistry
} from "./turn-suppression";

export const DEEPSEEK_SUPPRESSED_TURNS_KEY = "deepseekSuppressedTurnIds";
export { DEFAULT_SUPPRESSED_TURN_LIMIT };
export type { SuppressionStorage };
export type DeepSeekSuppressionRegistry = TurnSuppressionRegistry;

export class DeepSeekSuppressionStore
  extends TurnSuppressionStore
  implements DeepSeekSuppressionRegistry {
  public constructor(
    conversationId: string,
    storage?: SuppressionStorage,
    limit = DEFAULT_SUPPRESSED_TURN_LIMIT
  ) {
    super("deepseek", DEEPSEEK_SUPPRESSED_TURNS_KEY, conversationId, storage, limit);
  }
}
