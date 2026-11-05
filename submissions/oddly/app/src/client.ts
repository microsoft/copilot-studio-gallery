import { validateConfig } from "./settings";
import type { AgentConfig } from "./settings";

export interface ConnectorResult { success: boolean; data?: unknown; error?: unknown }
export interface CopilotConnector {
  ExecuteCopilotAsyncV2(
    agent: string, body: Record<string, unknown>, conversationId?: string, environmentId?: string,
  ): Promise<ConnectorResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string" && error.message) return error.message;
  return "The Copilot Studio connector request failed. Check player consent, agent access, publication, and tenant policy.";
}

export function readTurn(data: unknown): { conversationId: string; replies: string[] } {
  if (!isRecord(data)) throw new Error("The connector returned no conversation result. This runtime may not support Execute Agent and wait.");
  const conversationId = data.conversationId ?? data.ConversationId ?? data.conversationID;
  if (typeof conversationId !== "string" || !conversationId.trim()) throw new Error("The connector returned no conversation ID. Start a new chat rather than risk losing the conversation context.");
  if (data.responses !== undefined && (!Array.isArray(data.responses) || !data.responses.every(reply => typeof reply === "string"))) {
    throw new Error("The connector returned an unexpected answer format. This canvas supports text responses only.");
  }
  const replies: string[] = Array.isArray(data.responses) ? data.responses.filter((reply: string) => reply.trim()) : [];
  if (!replies.length && typeof data.lastResponse === "string" && data.lastResponse.trim()) replies.push(data.lastResponse);
  if (!replies.length) throw new Error("The agent returned no text answer. Cards, sign-in cards, attachments, and background-only responses cannot be displayed here. Use the agent's supported channel.");
  return { conversationId, replies };
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

  async send(message: string, locale: string): Promise<string[]> {
    if (!message.trim() || message.length > 8000) throw new Error("Write a message of 1-8,000 characters.");
    if (this.pending) throw new Error("Wait for the current answer before sending another message.");
    if (this.uncertain) throw new Error("The previous request could not be confirmed. Start a new chat; your earlier message may already have reached the agent.");
    this.pending = true;
    try {
      const result = await this.connector.ExecuteCopilotAsyncV2(
        this.config.schemaName,
        // Required by this operation; Microsoft documents that synchronous mode does not use it.
        { message, locale, notificationUrl: "https://notificationurlplaceholder" },
        this.conversationId || undefined,
        this.config.environmentId,
      );
      if (!result.success) throw new Error(errorMessage(result.error));
      // Native codegen currently declares data as void. Validate the actual payload instead of casting it.
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
