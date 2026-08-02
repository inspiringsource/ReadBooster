import { ChatGPTAdapter } from "./ChatGPTAdapter";
import { ClaudeAdapter } from "./ClaudeAdapter";
import type { ConversationAdapter } from "./ConversationAdapter";
import { GeminiAdapter } from "./GeminiAdapter";
import { MistralAdapter } from "./MistralAdapter";
import { GitHubDiscussionsAdapter } from "./GitHubDiscussionsAdapter";
import { supportedPlatformForHostname } from "../../shared/platforms";

export function getActiveAdapter(
  hostname: string = window.location.hostname,
  doc: Document = document,
): ConversationAdapter | null {
  const platform = supportedPlatformForHostname(hostname);
  switch (platform?.id) {
    case "chatgpt":
      return new ChatGPTAdapter(doc, platform.hostname);
    case "gemini":
      return new GeminiAdapter(doc, platform.hostname);
    case "mistral":
      return new MistralAdapter(doc, platform.hostname);
    case "claude":
      return new ClaudeAdapter(doc, platform.hostname);
    case "github-discussion":
      return new GitHubDiscussionsAdapter(doc, platform.hostname);
    default:
      return null;
  }
}
