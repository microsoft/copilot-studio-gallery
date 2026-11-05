export interface Message { id: string; role: "user" | "assistant"; text: string }

export function safeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined;
  } catch { return undefined; }
}

export function transcript(messages: Message[]): string {
  return messages.filter(message => message.text).map(message =>
    `## ${message.role === "user" ? "You" : "Oddly"}\n\n${message.text}`
  ).join("\n\n---\n\n");
}
