import { describe, expect, it, vi } from "vitest";

import {
  BrowserStickerRepository,
  loadStickers,
  removeSticker,
  saveSticker,
} from "../src/shared/stickerRepository";
import {
  STICKER_SCHEMA_VERSION,
  STICKER_STORAGE_KEY,
  clampStickerRatio,
  createSticker,
  normalizeStickerPosition,
  normalizeStickerStore,
  normalizeStickerText,
  stickerConversationIdentity,
  stickerSectionIdentity,
} from "../src/shared/stickers";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function response(
  id = "response-1",
  conversationId = "sticker-conversation",
  platform: ConversationDocument["source"] = "chatgpt",
): DocumentContentBlock {
  return {
    id,
    role: "assistant",
    html: "<p>Private response body.</p>",
    text: "Private response body.",
    provenance: {
      kind: "original",
      platform,
      sourceUrl: "https://example.invalid/conversation",
      sourceConversationId: conversationId,
      sourceMessageId: id,
      extractedAt: "2026-07-21T12:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(
  conversationId = "sticker-conversation",
  platform: ConversationDocument["source"] = "chatgpt",
): ConversationDocument {
  const block = response("response-1", conversationId, platform);
  return {
    id: `${platform}-${conversationId}`,
    source: platform,
    title: "Private conversation title",
    sourceUrl: "https://example.invalid/conversation",
    extractedAt: "2026-07-21T12:00:00.000Z",
    turns: [{ id: "turn-1", index: 0, prompt: null, response: block }],
  };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update));
  const area = { get, set } as unknown as chrome.storage.LocalStorageArea;
  vi.stubGlobal("chrome", { storage: { local: area } });
  return { values, get, set, area };
}

describe("sticker domain and local repository", () => {
  it("creates a section-associated sticker and validates short note text", () => {
    const current = conversation();
    const identity = stickerSectionIdentity(current, current.turns[0].response!);
    const sticker = createSticker(identity, { xRatio: 1.4, yRatio: -0.2 }, 42, "sticker-1");

    expect(identity).toEqual({
      conversationKey: "chatgpt:sticker-conversation",
      sectionKey: "chatgpt:response-1",
      persistable: true,
      persistence: "stable",
    });
    expect(sticker).toMatchObject({
      id: "sticker-1",
      conversationKey: identity.conversationKey,
      sectionKey: identity.sectionKey,
      text: "",
      position: { xRatio: 1, yRatio: 0 },
      isPinned: false,
      isCollapsed: false,
      createdAt: 42,
      updatedAt: 42,
      schemaVersion: 1,
    });
    expect(normalizeStickerText("  Verify this claim\r\nsoon  ")).toBe("Verify this claim\nsoon");
    expect(normalizeStickerText("   ")).toBeNull();
    expect(normalizeStickerText("x".repeat(1_001))).toBeNull();
    expect(clampStickerRatio(Number.NaN)).toBe(0);
    expect(normalizeStickerPosition({ xRatio: 0.25, yRatio: 2 })).toEqual({
      xRatio: 0.25,
      yRatio: 1,
    });
  });

  it("migrates the v1 boundary conservatively and ignores malformed entries", () => {
    const valid = {
      ...createSticker(
        {
          conversationKey: "gemini:conversation",
          sectionKey: "gemini:response",
          persistable: true,
          persistence: "stable",
        },
        { xRatio: 0.4, yRatio: 0.6 },
        10,
        "valid-sticker",
      ),
      text: "  Valid local note  ",
    };
    const normalized = normalizeStickerStore({
      version: 1,
      entries: [
        null,
        { ...valid, id: "__proto__" },
        { ...valid, text: "   " },
        { ...valid, position: { xRatio: -1, yRatio: 5 } },
        { ...valid, updatedAt: 12, text: "Newest valid note" },
      ],
    });

    expect(normalized).toEqual({
      version: STICKER_SCHEMA_VERSION,
      entries: [
        expect.objectContaining({
          id: "valid-sticker",
          text: "Newest valid note",
          position: { xRatio: 0.4, yRatio: 0.6 },
        }),
      ],
    });
    expect(normalizeStickerStore({ version: 2, entries: [valid] }).entries).toEqual([]);
  });

  it("stores only sticker metadata and restores only the matching provider conversation", async () => {
    const backend = storage();
    const current = conversation();
    const identity = stickerSectionIdentity(current, current.turns[0].response!);
    const sticker = {
      ...createSticker(identity, { xRatio: 0.75, yRatio: 0.2 }, 20, "sticker-2"),
      text: "Compare with the previous response",
      isPinned: true,
    };

    expect(await saveSticker(sticker, identity.persistable)).toBe("saved");
    expect(await loadStickers(current)).toEqual([sticker]);
    expect(await loadStickers(conversation("another-conversation"))).toEqual([]);
    expect(await loadStickers(conversation("sticker-conversation", "gemini"))).toEqual([]);

    const payload = JSON.stringify(backend.values[STICKER_STORAGE_KEY]);
    expect(payload).toContain("Compare with the previous response");
    expect(payload).not.toContain("Private response body");
    expect(payload).not.toContain("Private conversation title");
    expect(payload).not.toContain("example.invalid");

    expect(await removeSticker(sticker.conversationKey, sticker.id, true)).toBe("removed");
    expect(await loadStickers(current)).toEqual([]);
  });

  it("restores a fallback-identified response through a fresh repository instance", async () => {
    const backend = storage();
    const current = conversation("fallback-conversation", "gemini");
    const fallbackResponse = {
      ...current.turns[0].response!,
      provenance: { ...current.turns[0].response!.provenance, sourceMessageId: undefined },
    };
    const fallbackConversation = {
      ...current,
      turns: [{ ...current.turns[0], response: fallbackResponse }],
    };
    const identity = stickerSectionIdentity(fallbackConversation, fallbackResponse);
    const sticker = {
      ...createSticker(identity, { xRatio: 0.8, yRatio: 0.35 }, 25, "fallback-sticker"),
      text: "Restored from local storage",
      isPinned: true,
      isCollapsed: true,
    };

    expect(identity).toMatchObject({ persistable: true, persistence: "fallback" });
    const firstRepository = new BrowserStickerRepository(() => backend.area);
    expect(await firstRepository.upsert(sticker, identity.persistable)).toBe("saved");
    await firstRepository.flush();

    const reopenedConversation = structuredClone(fallbackConversation);
    const reopenedIdentity = stickerSectionIdentity(
      reopenedConversation,
      reopenedConversation.turns[0].response!,
    );
    const secondRepository = new BrowserStickerRepository(() => backend.area);
    expect(reopenedIdentity).toEqual(identity);
    expect(await secondRepository.load(reopenedConversation)).toEqual({
      stickers: [sticker],
      status: "loaded",
    });
  });

  it("uses verified conversation routes when provenance is absent", () => {
    const routes = [
      ["chatgpt", "https://chatgpt.com/c/chat-route", "chatgpt:chat-route"],
      ["gemini", "https://gemini.google.com/app/gemini-route", "gemini:gemini-route"],
      ["mistral", "https://chat.mistral.ai/work/mistral-route", "mistral:mistral-route"],
      ["claude", "https://claude.ai/chat/claude-route", "claude:claude-route"],
    ] as const;

    for (const [platform, sourceUrl, conversationKey] of routes) {
      const current = conversation("ignored", platform);
      const withoutProvenance = {
        ...current,
        sourceUrl,
        turns: current.turns.map((turn) => ({
          ...turn,
          response: turn.response
            ? {
                ...turn.response,
                provenance: {
                  ...turn.response.provenance,
                  sourceUrl,
                  sourceConversationId: undefined,
                },
              }
            : null,
        })),
      };
      expect(stickerConversationIdentity(withoutProvenance)).toEqual({
        conversationKey,
        persistable: true,
        persistence: "stable",
      });
    }
  });

  it("keeps a truly unidentified conversation session-only and fails safely on storage errors", async () => {
    const backend = storage();
    const current = conversation();
    const unstable = {
      ...current.turns[0].response!,
      provenance: {
        ...current.turns[0].response!.provenance,
        sourceConversationId: undefined,
        sourceMessageId: undefined,
        contentFingerprint: "",
      },
    };
    const unidentifiedConversation = {
      ...current,
      sourceUrl: "https://example.invalid/conversation",
      turns: [{ ...current.turns[0], response: unstable }],
    };
    const identity = stickerSectionIdentity(unidentifiedConversation, unstable);
    const sticker = {
      ...createSticker(identity, { xRatio: 1, yRatio: 0 }, 30, "session-sticker"),
      text: "Session note",
    };
    expect(identity.persistable).toBe(false);
    expect(identity.persistence).toBe("session");
    expect(await saveSticker(sticker, identity.persistable)).toBe("not-persistable");
    expect(backend.set).not.toHaveBeenCalled();

    backend.set.mockRejectedValueOnce(new Error("storage full"));
    expect(await saveSticker({ ...sticker, conversationKey: "chatgpt:stable" }, true)).toBe(
      "failed",
    );
  });
});
