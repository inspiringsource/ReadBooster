import { describe, expect, it } from "vitest";

import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";
import { GeminiAdapter } from "../src/content/adapters/GeminiAdapter";

describe.each([
  ["Claude", new ClaudeAdapter("claude.ai")],
  ["Gemini", new GeminiAdapter("gemini.google.com")],
])("%s adapter scaffold", (_name, adapter) => {
  it("is configured but cannot expose response extraction", () => {
    expect(adapter.isSupportedPage()).toBe(true);
    expect(adapter.capabilities).toEqual({
      configured: true,
      implemented: false,
      manuallyVerified: false,
      canExtractResponses: false,
    });
    expect(adapter.hasLatestAssistantResponse()).toBe(false);
    expect(adapter.getLatestAssistantResponse()).toBeNull();
    expect(adapter.getAllAssistantResponses()).toEqual([]);
  });
});
