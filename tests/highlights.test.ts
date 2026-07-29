import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { BrowserHighlightRepository } from "../src/shared/highlightRepository";
import {
  HIGHLIGHT_SCHEMA_VERSION,
  HIGHLIGHT_STORAGE_KEY,
  createHighlight,
  highlightSectionIdentity,
  normalizeHighlightStore,
  resolveHighlightInsertion,
} from "../src/shared/highlights";
import {
  assignHighlightBlockIds,
  resolveHighlightAnchor,
  selectionToHighlightDraft,
} from "../src/reader/highlights/highlightAnchoring";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function response(): DocumentContentBlock {
  return {
    id: "response-1",
    role: "assistant",
    html: "<p>Alpha important passage omega.</p>",
    text: "Alpha important passage omega.",
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/highlight-conversation",
      sourceConversationId: "highlight-conversation",
      sourceMessageId: "response-1",
      extractedAt: "2026-07-29T08:00:00.000Z",
      contentFingerprint: "highlight-fingerprint",
    },
  };
}

function conversation(): ConversationDocument {
  const block = response();
  return {
    id: "highlight-conversation",
    source: "chatgpt",
    title: "Highlight fixture",
    sourceUrl: "https://chatgpt.com/c/highlight-conversation",
    extractedAt: "2026-07-29T08:00:00.000Z",
    turns: [{ id: "turn-1", index: 0, prompt: null, response: block }],
  };
}

function anchorFor(root: HTMLElement) {
  const block = assignHighlightBlockIds(root)[0];
  return {
    blockId: block.dataset.rbHighlightBlockId!,
    selectedText: "important passage",
    prefix: "Alpha ",
    suffix: " omega.",
    startOffset: 6,
    endOffset: 23,
  };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update));
  return {
    values,
    area: { get, set } as unknown as chrome.storage.LocalStorageArea,
  };
}

describe("highlight anchoring and persistence", () => {
  it("creates a single-block selection draft and excludes code", () => {
    const reader = document.createElement("div");
    reader.innerHTML = `
      <section data-rb-section-id="section-1" data-rb-response-id="response-1">
        <article class="rb-content"><p>Alpha important passage omega.</p><pre><code>secret</code></pre></article>
      </section>`;
    document.body.append(reader);
    const text = reader.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 23);
    Object.defineProperty(range, "getBoundingClientRect", {
      value: () => new DOMRect(20, 30, 80, 18),
    });
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selectionToHighlightDraft(selection, reader)).toMatchObject({
      sectionId: "section-1",
      responseId: "response-1",
      selectedText: "important passage",
      prefix: "Alpha ",
      suffix: " omega.",
      startOffset: 6,
      endOffset: 23,
    });

    const whitespaceRange = document.createRange();
    whitespaceRange.setStart(text, 5);
    whitespaceRange.setEnd(text, 6);
    selection.removeAllRanges();
    selection.addRange(whitespaceRange);
    expect(selectionToHighlightDraft(selection, reader)).toBeNull();

    const codeText = reader.querySelector("code")!.firstChild!;
    const codeRange = document.createRange();
    codeRange.setStart(codeText, 0);
    codeRange.setEnd(codeText, 6);
    selection.removeAllRanges();
    selection.addRange(codeRange);
    expect(selectionToHighlightDraft(selection, reader)).toBeNull();
  });

  it("restores exact and contextual anchors but rejects ambiguous repeated text", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>Alpha important passage omega.</p>";
    const identity = highlightSectionIdentity(conversation(), response());
    const highlight = createHighlight(identity, anchorFor(root), "yellow", 10, "highlight-1");
    expect(resolveHighlightAnchor(root, highlight)).toMatchObject({
      startOffset: 6,
      endOffset: 23,
      confidence: "exact",
    });

    root.innerHTML = "<p>Preface.</p><p>Alpha important passage omega.</p>";
    expect(resolveHighlightAnchor(root, { ...highlight, blockId: "missing-block" })).toMatchObject({
      confidence: "context",
    });

    root.innerHTML = "<p>Alpha important passage omega.</p><p>Alpha important passage omega.</p>";
    const changedBlockId = { ...highlight, blockId: "missing-block" };
    expect(resolveHighlightAnchor(root, changedBlockId)).toBeNull();

    root.innerHTML = "<p>First important passage end.</p><p>Second important passage end.</p>";
    expect(
      resolveHighlightAnchor(root, {
        ...changedBlockId,
        prefix: "Second ",
        suffix: " end.",
        startOffset: 7,
        endOffset: 24,
      }),
    ).toMatchObject({ startOffset: 7, endOffset: 24, confidence: "context" });
  });

  it("merges adjacent same-style ranges and rejects partial overlap", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>Alpha important passage omega.</p>";
    const identity = highlightSectionIdentity(conversation(), response());
    const first = createHighlight(
      identity,
      { ...anchorFor(root), selectedText: "important", suffix: " passage omega.", endOffset: 15 },
      "yellow",
      10,
      "first",
    );
    const adjacent = {
      ...anchorFor(root),
      selectedText: " passage",
      prefix: "Alpha important",
      suffix: " omega.",
      startOffset: 15,
      endOffset: 23,
    };
    expect(
      resolveHighlightInsertion(
        [first],
        identity,
        adjacent,
        "yellow",
        "Alpha important passage omega.",
        20,
      ),
    ).toMatchObject({
      kind: "merged",
      highlight: { id: "first", selectedText: "important passage", startOffset: 6, endOffset: 23 },
    });
    expect(
      resolveHighlightInsertion(
        [first],
        identity,
        { ...adjacent, selectedText: "ant pass", startOffset: 12, endOffset: 20 },
        "blue",
        "Alpha important passage omega.",
      ),
    ).toEqual({ kind: "overlap" });
  });

  it("validates malformed storage and restores through a fresh repository instance", async () => {
    const backend = storage();
    const current = conversation();
    const root = document.createElement("article");
    root.innerHTML = response().html;
    const highlight = createHighlight(
      highlightSectionIdentity(current, current.turns[0].response!),
      anchorFor(root),
      "green",
      10,
      "persisted-highlight",
    );
    const firstRepository = new BrowserHighlightRepository(() => backend.area);
    expect(await firstRepository.upsert(highlight, true)).toBe("saved");
    await firstRepository.flush();
    const secondRepository = new BrowserHighlightRepository(() => backend.area);
    expect(await secondRepository.load(structuredClone(current))).toEqual({
      highlights: [highlight],
      status: "loaded",
    });
    const anotherPlatform = {
      ...current,
      id: "mistral-highlight-conversation",
      source: "mistral" as const,
      sourceUrl: "https://chat.mistral.ai/work/highlight-conversation",
      turns: current.turns.map((turn) => ({
        ...turn,
        response: turn.response
          ? {
              ...turn.response,
              provenance: { ...turn.response.provenance, platform: "mistral" as const },
            }
          : null,
      })),
    };
    expect((await secondRepository.load(anotherPlatform)).highlights).toEqual([]);
    expect(JSON.stringify(backend.values[HIGHLIGHT_STORAGE_KEY])).not.toContain(response().html);

    expect(
      normalizeHighlightStore({
        version: HIGHLIGHT_SCHEMA_VERSION,
        entries: [highlight, { ...highlight, id: "invalid", endOffset: 99 }],
      }).entries,
    ).toEqual([highlight]);

    const failingBackend = storage();
    failingBackend.area.set = vi.fn().mockRejectedValue(new Error("storage full"));
    expect(
      await new BrowserHighlightRepository(() => failingBackend.area).upsert(highlight, true),
    ).toBe("failed");
  });

  it("keeps highlight controls out of print and preserves a non-colour print signal", () => {
    const readerCss = readFileSync("src/reader/reader.css", "utf8");
    const printCss = readFileSync("src/reader/reader.print.css", "utf8");
    expect(readerCss).toContain(".rb-highlight--yellow");
    expect(readerCss).toContain("text-decoration-line: underline");
    expect(printCss).toContain(".rb-highlight-toolbar");
    expect(printCss).toContain("text-decoration: underline 1pt #555");
  });
});
