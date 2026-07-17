import { describe, expect, it } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";
import { GeminiAdapter } from "../src/content/adapters/GeminiAdapter";
import { getActiveAdapter } from "../src/content/adapters/getActiveAdapter";

describe("getActiveAdapter", () => {
  it("selects the two production-supported hostname adapters", () => {
    expect(getActiveAdapter("chatgpt.com", document)).toBeInstanceOf(ChatGPTAdapter);
    expect(getActiveAdapter("gemini.google.com", document)).toBeInstanceOf(GeminiAdapter);
  });

  it("returns null for unsupported and lookalike hostnames", () => {
    expect(getActiveAdapter("example.com", document)).toBeNull();
    expect(getActiveAdapter("claude.ai", document)).toBeNull();
    expect(getActiveAdapter("chat.claude.ai", document)).toBeNull();
    expect(getActiveAdapter("mistral.ai", document)).toBeNull();
    expect(getActiveAdapter("chat.mistral.ai", document)).toBeNull();
    expect(getActiveAdapter("chatgpt.com.example.org", document)).toBeNull();
    expect(getActiveAdapter("gemini.google.example", document)).toBeNull();
    expect(getActiveAdapter("labs.gemini.google.com", document)).toBeNull();
  });
});
