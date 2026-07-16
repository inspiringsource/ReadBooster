import { describe, expect, it, vi } from "vitest";

import {
  applySectionTitleOverrides,
  conversationCopyText,
  deriveConversationOutline,
  deriveConversationSections,
} from "../src/reader/presentation";
import {
  CUSTOM_SECTION_TITLE_MAX_LENGTH,
  normalizeCustomSectionTitle,
  normalizeSectionTitleOverrideStore,
  SECTION_TITLE_OVERRIDES_STORAGE_KEY,
  sectionTitleOverrideIdentity,
} from "../src/shared/sectionTitleOverrides";
import {
  loadSectionTitleOverrides,
  removeSectionTitleOverride,
  saveSectionTitleOverride,
} from "../src/shared/storage";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function response(
  id: string,
  heading: string,
  conversationId = "titles-fixture",
): DocumentContentBlock {
  return {
    id,
    role: "assistant",
    html: `<h2 id="heading-${id}">${heading}</h2><p>Original response body ${id}</p>`,
    text: `${heading} Original response body ${id}`,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: `https://chatgpt.com/c/${conversationId}`,
      sourceConversationId: conversationId,
      sourceMessageId: id,
      extractedAt: "2026-07-16T14:00:00.000Z",
      contentFingerprint: `fingerprint-${id}-${heading}`,
    },
  };
}

function conversation(
  conversationId = "titles-fixture",
  responses = [response("response-1", "Automatic heading", conversationId)],
): ConversationDocument {
  return {
    id: `chatgpt-${conversationId}`,
    source: "chatgpt",
    title: "Title fixture",
    sourceUrl: `https://chatgpt.com/c/${conversationId}`,
    extractedAt: "2026-07-16T14:00:00.000Z",
    turns: responses.map((block, index) => ({
      id: `turn-${block.id}`,
      index,
      prompt: null,
      response: block,
    })),
  };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => {
    Object.assign(values, update);
  });
  vi.stubGlobal("chrome", { storage: { local: { get, set } } });
  return { values, get, set };
}

describe("custom section-title model and persistence", () => {
  it("keeps the automatic title and source content while applying a custom display title", () => {
    const document = conversation();
    const automatic = deriveConversationSections(document);
    const identity = sectionTitleOverrideIdentity(document, automatic[0].response);
    const displayed = applySectionTitleOverrides(
      document,
      automatic,
      new Map([[identity.lookupKey, "Rename outline sections"]]),
    );

    expect(automatic[0]).toMatchObject({
      automaticTitle: "Automatic heading",
      title: "Automatic heading",
      hasCustomTitle: false,
    });
    expect(displayed[0]).toMatchObject({
      automaticTitle: "Automatic heading",
      title: "Rename outline sections",
      hasCustomTitle: true,
    });
    expect(displayed[0].response).toBe(document.turns[0].response);
    expect(displayed[0].response.html).toContain("Automatic heading");
    expect(conversationCopyText(displayed)).toContain(
      "Rename outline sections\n\nAutomatic heading Original response body response-1",
    );
    expect(deriveConversationOutline(displayed)[0].children[0].text).toBe("Automatic heading");
  });

  it("normalizes whitespace and rejects empty and overlong custom titles", () => {
    expect(normalizeCustomSectionTitle("  Rename\n  outline\tsections  ")).toBe(
      "Rename outline sections",
    );
    expect(normalizeCustomSectionTitle("   \n ")).toBeNull();
    expect(normalizeCustomSectionTitle("x".repeat(CUSTOM_SECTION_TITLE_MAX_LENGTH + 1))).toBeNull();
  });

  it("ignores malformed, unsafe, and unknown stored records", () => {
    const normalized = normalizeSectionTitleOverrideStore({
      version: 1,
      entries: [
        null,
        { conversationKey: "__proto__", responseKey: "message", title: "Unsafe" },
        { conversationKey: "chatgpt:one", responseKey: "constructor", title: "Unsafe" },
        { conversationKey: "chatgpt:one", responseKey: "message", title: "   " },
        {
          conversationKey: "chatgpt:one",
          responseKey: "message",
          title: "  Valid   title ",
          unknown: "ignored",
        },
      ],
    });

    expect(normalized).toEqual({
      version: 1,
      entries: [{ conversationKey: "chatgpt:one", responseKey: "message", title: "Valid title" }],
    });
    expect(normalizeSectionTitleOverrideStore({ version: 2, entries: [] }).entries).toEqual([]);
  });

  it("reloads only the matching conversation and response and stores no conversation body", async () => {
    const backend = storage();
    const current = conversation();
    const currentResponse = current.turns[0].response!;
    expect(await saveSectionTitleOverride(current, currentResponse, "  Custom   title ")).toBe(
      "saved",
    );

    const loaded = await loadSectionTitleOverrides(current);
    const identity = sectionTitleOverrideIdentity(current, currentResponse);
    expect(loaded.get(identity.lookupKey)).toBe("Custom title");

    const otherConversation = conversation("another-conversation", [
      response("response-1", "Other", "another-conversation"),
    ]);
    expect(await loadSectionTitleOverrides(otherConversation)).toEqual(new Map());
    const anotherResponse = response("response-2", "Another response");
    expect(
      loaded.get(sectionTitleOverrideIdentity(current, anotherResponse).lookupKey),
    ).toBeUndefined();

    const payload = JSON.stringify(backend.values[SECTION_TITLE_OVERRIDES_STORAGE_KEY]);
    expect(payload).toContain("Custom title");
    expect(payload).not.toContain("Original response body");
    expect(payload).not.toContain("<h2");
    expect(payload).not.toContain("chatgpt.com/c/");
    expect(Object.keys(backend.values)).toEqual([SECTION_TITLE_OVERRIDES_STORAGE_KEY]);
  });

  it("removes the persisted entry and fails safely when storage rejects", async () => {
    const backend = storage();
    const current = conversation();
    const currentResponse = current.turns[0].response!;
    await saveSectionTitleOverride(current, currentResponse, "Custom title");
    expect(await removeSectionTitleOverride(current, currentResponse)).toBe("removed");
    expect(
      normalizeSectionTitleOverrideStore(backend.values[SECTION_TITLE_OVERRIDES_STORAGE_KEY])
        .entries,
    ).toEqual([]);

    backend.set.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(await saveSectionTitleOverride(current, currentResponse, "Session title")).toBe(
      "failed",
    );
  });

  it("keeps unstable identities session-only instead of risking a cross-session match", async () => {
    storage();
    const current = conversation();
    const unstableResponse = {
      ...current.turns[0].response!,
      provenance: {
        ...current.turns[0].response!.provenance,
        sourceMessageId: undefined,
      },
    };
    const identity = sectionTitleOverrideIdentity(current, unstableResponse);
    expect(identity.persistable).toBe(false);
    expect(await saveSectionTitleOverride(current, unstableResponse, "Session only")).toBe(
      "not-persistable",
    );
  });
});
