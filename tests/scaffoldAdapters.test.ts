import { describe, expect, it } from "vitest";

import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";

describe("Claude adapter capabilities", () => {
  it("is configured and implemented without overstating live verification", () => {
    const doc = new DOMParser().parseFromString("<main></main>", "text/html");
    const adapter = new ClaudeAdapter(doc, "claude.ai", "https://claude.ai/new");
    expect(adapter.isSupportedPage()).toBe(true);
    expect(adapter.displayName).toBe("Claude");
    expect(adapter.capabilities).toEqual({
      configured: true,
      implemented: true,
      manuallyVerified: false,
      canExtractResponses: true,
    });
    expect(adapter.hasLatestAssistantResponse()).toBe(false);
    expect(adapter.getConversationDocument()).toBeNull();
    expect(adapter.getLatestAssistantResponse()).toBeNull();
    expect(adapter.getAllAssistantResponses()).toEqual([]);
  });
});
