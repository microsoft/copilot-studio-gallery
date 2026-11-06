import { validateConfig } from "./settings";
import type { AgentConfig } from "./settings";

export interface ConnectorResult { success: boolean; data?: unknown; error?: unknown }
export interface CopilotConnector {
  InvokeAgent(
    body: Record<string, unknown>, conversationId?: string, environmentId?: string, signal?: AbortSignal,
  ): Promise<ConnectorResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message) return error.message;
  return "The Agent Node connector request failed. Check player consent, agent access, publication, and tenant policy.";
}

export function readTurn(data: unknown): { conversationId: string; replies: string[] } {
  if (!isRecord(data)) throw new Error("The connector returned no conversation result. Check that the player supports Agent Node / InvokeAgent.");
  const conversationId = data.conversationId;
  if (typeof conversationId !== "string" || !conversationId.trim()) throw new Error("The connector returned no conversation ID. Start a new chat rather than risk losing the conversation context.");
  if (data.status !== undefined && data.status !== "Completed") {
    throw new Error("The agent did not return a completed turn. Check its run status before sending another message.");
  }
  if (Object.keys(data).length === 1) throw new Error("InvokeAgent returned only a conversation ID: an acknowledgement, not a completed answer. Completion retrieval returned no answer. The agent may still be running; do not resend the message to retrieve its result.");
  if (data.result !== undefined && typeof data.result !== "string") {
    throw new Error("The connector returned an unexpected answer format. This canvas supports text responses only.");
  }
  if (typeof data.result !== "string" || !data.result.trim()) throw new Error("The agent returned no text answer. Structured-only output, cards, sign-in cards, files, and background-only responses cannot be displayed here. Use the agent's supported channel.");
  return { conversationId, replies: [data.result] };
}

export class AgentSession {
  private readonly config: AgentConfig;
  private conversationId = "";
  private pending = false;
  private uncertain = false;

  constructor(config: AgentConfig, private readonly connector: CopilotConnector) {
    validateConfig(config);
    this.config = { ...config };
  }

  fork(): AgentSession { return new AgentSession(this.config, this.connector); }

  async send(message: string, signal?: AbortSignal): Promise<string[]> {
    if (!message.trim() || message.length > 8000) throw new Error("Write a message of 1-8,000 characters.");
    if (this.pending) throw new Error("Wait for the current answer before sending another message.");
    if (this.uncertain) throw new Error("The previous request could not be confirmed. Start a new chat; your earlier message may already have reached the agent.");
    if (signal?.aborted) throw new Error("The request was cancelled before it was sent.");
    this.pending = true;
    try {
      const result = await this.connector.InvokeAgent(
        { agentId: this.config.schemaName, prompt: message },
        this.conversationId || undefined,
        this.config.environmentId,
        signal,
      );
      if (!result.success) throw new Error(errorMessage(result.error));
      const turn = readTurn(result.data);
      if (this.conversationId && turn.conversationId !== this.conversationId) throw new Error("The agent changed the conversation ID unexpectedly. Start a new chat to keep conversations separate.");
      this.conversationId = turn.conversationId;
      return turn.replies;
    } catch (failure) {
      this.uncertain = true;
      throw failure;
    } finally {
      this.pending = false;
    }
  }
}
