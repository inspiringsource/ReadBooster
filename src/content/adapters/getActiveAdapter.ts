import { ChatGPTAdapter } from "./ChatGPTAdapter";
import { ClaudeAdapter } from "./ClaudeAdapter";
import type { ConversationAdapter } from "./ConversationAdapter";
import { GeminiAdapter } from "./GeminiAdapter";

export function getActiveAdapter(
  hostname: string = window.location.hostname,
  doc: Document = document,
): ConversationAdapter | null {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  if (normalized === "chatgpt.com" || normalized.endsWith(".chatgpt.com")) {
    return new ChatGPTAdapter(doc, normalized);
  }
  if (normalized === "claude.ai" || normalized.endsWith(".claude.ai")) {
    return new ClaudeAdapter(normalized);
  }
  if (normalized === "gemini.google.com") {
    return new GeminiAdapter(normalized);
  }
  return null;
}
