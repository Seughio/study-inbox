import type { ConversationEvent } from "../shared/contracts";
import type { EventTransport } from "../storage/retry-queue";

const API_ORIGIN = "http://127.0.0.1:8765";

export class LocalApiClient implements EventTransport {
  public async send(event: ConversationEvent): Promise<"sent" | "duplicate"> {
    const response = await fetch(`${API_ORIGIN}/api/v1/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!response.ok) throw new Error(`local API returned ${response.status}`);
    const body = (await response.json()) as { created?: unknown };
    if (typeof body.created !== "boolean") {
      throw new Error("local API response shape is invalid");
    }
    return body.created ? "sent" : "duplicate";
  }

  public async isOnline(): Promise<boolean> {
    try {
      const response = await fetch(`${API_ORIGIN}/health`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }
}
