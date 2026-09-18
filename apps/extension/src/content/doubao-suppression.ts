import {
  DEFAULT_SUPPRESSED_TURN_LIMIT,
  TurnSuppressionStore,
  type SuppressionStorage,
  type TurnSuppressionRegistry
} from "./turn-suppression";

export const DOUBAO_SUPPRESSED_TURNS_KEY = "doubaoSuppressedTurnIds";
export type DoubaoSuppressionRegistry = TurnSuppressionRegistry;

export class DoubaoSuppressionStore
  extends TurnSuppressionStore
  implements DoubaoSuppressionRegistry {
  public constructor(
    conversationId: string,
    storage?: SuppressionStorage,
    limit = DEFAULT_SUPPRESSED_TURN_LIMIT
  ) {
    super("doubao", DOUBAO_SUPPRESSED_TURNS_KEY, conversationId, storage, limit);
  }
}
