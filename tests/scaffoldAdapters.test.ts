import { describe, expect, it } from "vitest";

import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";

describe("isolated Claude adapter scaffold", () => {
  it("is not configured and cannot expose response extraction", () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.isSupportedPage()).toBe(false);
    expect(adapter.capabilities).toEqual({
      configured: false,
      implemented: false,
      manuallyVerified: false,
      canExtractResponses: false,
    });
    expect(adapter.hasLatestAssistantResponse()).toBe(false);
    expect(adapter.getConversationDocument()).toBeNull();
    expect(adapter.getLatestAssistantResponse()).toBeNull();
    expect(adapter.getAllAssistantResponses()).toEqual([]);
  });
});
