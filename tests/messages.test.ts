import { describe, expect, it, vi } from "vitest";

import { createContentMessageListener } from "../src/content/messages";

describe("content message listener", () => {
  it("returns literal true and sends a typed failure when the handler rejects", async () => {
    const sendResponse = vi.fn();
    const listener = createContentMessageListener(
      async () => {
        throw new Error("unexpected failure");
      },
      () => true,
    );

    const keepChannelOpen = listener(
      { type: "READBOOSTER_OPTIMIZE_LATEST" },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        supported: true,
        reason: "reader-error",
      }),
    );
  });

  it("ignores unknown message types synchronously", () => {
    const handler = vi.fn();
    const listener = createContentMessageListener(handler, () => true);
    expect(listener({ type: "OTHER" }, {} as chrome.runtime.MessageSender, vi.fn())).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
