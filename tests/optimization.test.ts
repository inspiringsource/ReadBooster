import { describe, expect, it, vi } from "vitest";

import type { ConversationAdapter } from "../src/content/adapters/ConversationAdapter";
import { createOptimizationService } from "../src/content/optimization";
import type {
  ConversationDocument,
  DocumentContentBlock,
  ExtractedResponse,
} from "../src/shared/types";

const RESPONSE: ExtractedResponse = {
  id: "latest",
  source: "chatgpt",
  html: "<p>Latest response</p>",
  text: "Latest response",
  extractedAt: "2026-07-14T00:00:00.000Z",
};

const BLOCK: DocumentContentBlock = {
  id: RESPONSE.id,
  role: "assistant",
  html: RESPONSE.html,
  text: RESPONSE.text,
  provenance: {
    kind: "original",
    platform: "chatgpt",
    sourceUrl: "https://chatgpt.com/c/test",
    sourceConversationId: "test",
    sourceMessageId: RESPONSE.id,
    extractedAt: RESPONSE.extractedAt,
    contentFingerprint: "djb2-test",
  },
};

const DOCUMENT: ConversationDocument = {
  id: "chatgpt-test",
  source: "chatgpt",
  title: null,
  sourceUrl: "https://chatgpt.com/c/test",
  extractedAt: RESPONSE.extractedAt,
  turns: [{ id: "turn-0", index: 0, prompt: null, response: BLOCK }],
};

function implementedAdapter(): ConversationAdapter {
  return {
    source: "chatgpt",
    capabilities: {
      configured: true,
      implemented: true,
      manuallyVerified: false,
      canExtractResponses: true,
    },
    isSupportedPage: vi.fn(() => true),
    getConversationDocument: vi.fn(() => DOCUMENT),
    hasLatestAssistantResponse: vi.fn(() => true),
    getLatestAssistantResponse: vi.fn(() => RESPONSE),
    getAllAssistantResponses: vi.fn(() => [RESPONSE]),
    observePageChanges: vi.fn(() => () => undefined),
  };
}

describe("optimization service", () => {
  it("serializes concurrent requests and permits a later completed request", async () => {
    const adapter = implementedAdapter();
    let resolveMount!: () => void;
    const firstMount = new Promise<void>((resolve) => {
      resolveMount = resolve;
    });
    const mount = vi.fn().mockReturnValueOnce(firstMount).mockResolvedValue(undefined);
    const service = createOptimizationService(adapter, mount);

    const first = service.optimizeLatest();
    const duplicate = service.optimizeLatest();

    expect(duplicate).toBe(first);
    expect(service.isBusy()).toBe(true);
    expect(adapter.getConversationDocument).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledOnce();
    expect(mount).toHaveBeenCalledWith(DOCUMENT, BLOCK);

    resolveMount();
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(service.isBusy()).toBe(false);

    await expect(service.optimizeLatest()).resolves.toMatchObject({ ok: true });
    expect(adapter.getConversationDocument).toHaveBeenCalledTimes(2);
    expect(mount).toHaveBeenCalledTimes(2);
  });

  it("uses the lightweight availability method for status", () => {
    const adapter = implementedAdapter();
    const service = createOptimizationService(adapter, vi.fn());

    expect(service.getStatus()).toMatchObject({
      supported: true,
      canExtractResponses: true,
      responseAvailable: true,
    });
    expect(adapter.hasLatestAssistantResponse).toHaveBeenCalledOnce();
    expect(adapter.getLatestAssistantResponse).not.toHaveBeenCalled();
    expect(adapter.getAllAssistantResponses).not.toHaveBeenCalled();
  });

  it("fails safely when no responses remain available", async () => {
    const adapter = implementedAdapter();
    vi.mocked(adapter.getConversationDocument).mockReturnValue({ ...DOCUMENT, turns: [] });
    const mount = vi.fn();
    const service = createOptimizationService(adapter, mount);

    await expect(service.optimizeLatest()).resolves.toEqual({
      ok: false,
      supported: true,
      reason: "no-response",
    });
    expect(mount).not.toHaveBeenCalled();
  });
});
