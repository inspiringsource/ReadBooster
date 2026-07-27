import { describe, expect, it, vi } from "vitest";

import type { ConversationAdapter } from "../src/content/adapters/ConversationAdapter";
import { createOptimizationService } from "../src/content/optimization";
import type {
  ConversationDocument,
  ConversationScanResult,
  DocumentContentBlock,
  ExtractedResponse,
  RefreshConversation,
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
    displayName: "ChatGPT",
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
    expect(mount).toHaveBeenCalledWith(DOCUMENT, BLOCK, expect.any(Function));

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

  it("passes a refresh capability that performs a fresh adapter extraction", async () => {
    const adapter = implementedAdapter();
    const refreshedDocument: ConversationDocument = {
      ...DOCUMENT,
      extractedAt: "2026-07-16T09:30:00.000Z",
      turns: [
        ...DOCUMENT.turns,
        {
          id: "turn-new",
          index: 1,
          prompt: null,
          response: {
            ...BLOCK,
            id: "new-response",
            text: "New response",
            provenance: {
              ...BLOCK.provenance,
              sourceMessageId: "new-response",
              contentFingerprint: "djb2-new-response",
            },
          },
        },
      ],
    };
    vi.mocked(adapter.getConversationDocument)
      .mockReturnValueOnce(DOCUMENT)
      .mockReturnValueOnce(refreshedDocument);
    let refresh!: RefreshConversation;
    const mount = vi.fn(
      async (
        _document: ConversationDocument,
        _block: DocumentContentBlock,
        refreshConversation: RefreshConversation,
      ) => {
        refresh = refreshConversation;
      },
    );
    const service = createOptimizationService(adapter, mount);

    await service.optimizeLatest();
    const refreshResult: ConversationScanResult = {
      document: refreshedDocument,
      scanPerformed: false,
      completed: false,
      terminationReason: "single-snapshot",
    };
    await expect(refresh()).resolves.toEqual(refreshResult);
    expect(adapter.getConversationDocument).toHaveBeenCalledTimes(2);
  });

  it("uses the adapter's bounded scan capability when one is available", async () => {
    const adapter = implementedAdapter();
    const scanned = {
      document: DOCUMENT,
      scanPerformed: true,
      completed: true,
      terminationReason: "bottom" as const,
    };
    adapter.scanConversationDocument = vi.fn().mockResolvedValue(scanned);
    let refresh!: RefreshConversation;
    const mount = vi.fn(
      async (
        _document: ConversationDocument,
        _block: DocumentContentBlock,
        refreshConversation: RefreshConversation,
      ) => {
        refresh = refreshConversation;
      },
    );
    const service = createOptimizationService(adapter, mount);

    await service.optimizeLatest();
    const controller = new AbortController();
    await expect(refresh({ signal: controller.signal })).resolves.toBe(scanned);
    expect(adapter.scanConversationDocument).toHaveBeenCalledWith({
      signal: controller.signal,
    });
    expect(adapter.getConversationDocument).toHaveBeenCalledOnce();
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
