import { ChatGPTAdapter } from "./ChatGPTAdapter";
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
  if (normalized === "gemini.google.com") {
    return new GeminiAdapter(doc, normalized);
  }
  return null;
}
