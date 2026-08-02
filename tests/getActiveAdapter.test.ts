import { describe, expect, it } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";
import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";
import { GeminiAdapter } from "../src/content/adapters/GeminiAdapter";
import { getActiveAdapter } from "../src/content/adapters/getActiveAdapter";
import { MistralAdapter } from "../src/content/adapters/MistralAdapter";
import { GitHubDiscussionsAdapter } from "../src/content/adapters/GitHubDiscussionsAdapter";

describe("getActiveAdapter", () => {
  it("selects the four AI adapters and the GitHub Discussions adapter", () => {
    expect(getActiveAdapter("chatgpt.com", document)).toBeInstanceOf(ChatGPTAdapter);
    expect(getActiveAdapter("gemini.google.com", document)).toBeInstanceOf(GeminiAdapter);
    expect(getActiveAdapter("chat.mistral.ai", document)).toBeInstanceOf(MistralAdapter);
    expect(getActiveAdapter("claude.ai", document)).toBeInstanceOf(ClaudeAdapter);
    expect(getActiveAdapter("github.com", document)).toBeInstanceOf(GitHubDiscussionsAdapter);
  });

  it("returns null for unsupported and lookalike hostnames", () => {
    expect(getActiveAdapter("example.com", document)).toBeNull();
    expect(getActiveAdapter("chat.claude.ai", document)).toBeNull();
    expect(getActiveAdapter("mistral.ai", document)).toBeNull();
    expect(getActiveAdapter("www.chat.mistral.ai", document)).toBeNull();
    expect(getActiveAdapter("chatgpt.com.example.org", document)).toBeNull();
    expect(getActiveAdapter("gemini.google.example", document)).toBeNull();
    expect(getActiveAdapter("labs.gemini.google.com", document)).toBeNull();
  });
});
