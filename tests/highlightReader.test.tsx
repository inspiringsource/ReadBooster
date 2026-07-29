import { act, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { assignHighlightBlockIds } from "../src/reader/highlights/highlightAnchoring";
import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import {
  HIGHLIGHT_SCHEMA_VERSION,
  HIGHLIGHT_STORAGE_KEY,
  createHighlight,
  highlightSectionIdentity,
} from "../src/shared/highlights";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function conversation(): ConversationDocument {
  const response: DocumentContentBlock = {
    id: "reader-response",
    role: "assistant",
    html: "<h2>Reader heading</h2><p>Alpha important passage omega.</p>",
    text: "Reader heading\nAlpha important passage omega.",
    provenance: {
      kind: "original",
      platform: "gemini",
      sourceUrl: "https://gemini.google.com/app/highlight-reader",
      sourceConversationId: "highlight-reader",
      sourceMessageId: "reader-response",
      extractedAt: "2026-07-29T08:00:00.000Z",
      contentFingerprint: "reader-highlight-fingerprint",
    },
  };
  return {
    id: "highlight-reader",
    source: "gemini",
    title: "Highlight Reader",
    sourceUrl: "https://gemini.google.com/app/highlight-reader",
    extractedAt: "2026-07-29T08:00:00.000Z",
    turns: [{ id: "turn-1", index: 0, prompt: null, response }],
  };
}

function storedHighlight(current: ConversationDocument) {
  const temporary = document.createElement("article");
  temporary.innerHTML = current.turns[0].response!.html;
  const paragraph = assignHighlightBlockIds(temporary).find((block) => block.tagName === "P")!;
  return createHighlight(
    highlightSectionIdentity(current, current.turns[0].response!),
    {
      blockId: paragraph.dataset.rbHighlightBlockId!,
      selectedText: "important passage",
      prefix: "Alpha ",
      suffix: " omega.",
      startOffset: 6,
      endOffset: 23,
    },
    "yellow",
    10,
    "reader-highlight",
  );
}

function storage(initial: Record<string, unknown>) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update));
  vi.stubGlobal("chrome", {
    storage: { local: { get, set } },
    runtime: { getURL: (path: string) => path },
  });
  return { values, get, set };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

describe("Reader highlights", () => {
  it("recovers a fingerprint-owned highlight only when its passage resolves uniquely", async () => {
    const original = conversation();
    const originalResponse = {
      ...original.turns[0].response!,
      provenance: {
        ...original.turns[0].response!.provenance,
        sourceMessageId: undefined,
        contentFingerprint: "old-fingerprint",
      },
    };
    const originalConversation = {
      ...original,
      turns: [{ ...original.turns[0], response: originalResponse }],
    };
    const highlight = storedHighlight(originalConversation);
    storage({
      [HIGHLIGHT_STORAGE_KEY]: {
        version: HIGHLIGHT_SCHEMA_VERSION,
        entries: [highlight],
      },
    });
    const changedResponse = {
      ...originalResponse,
      provenance: { ...originalResponse.provenance, contentFingerprint: "new-fingerprint" },
    };
    const changedConversation = {
      ...originalConversation,
      turns: [{ ...originalConversation.turns[0], response: changedResponse }],
    };
    await act(async () => mountReader(changedConversation));
    expect(
      shadowRoot().querySelector("mark[data-rb-highlight-id='reader-highlight']")?.textContent,
    ).toBe("important passage");
  });

  it("creates a highlight from a Reader selection and restores it after remount", async () => {
    const current = conversation();
    const backend = storage({});
    await act(async () => mountReader(current));
    let shadow = shadowRoot();
    const paragraph = Array.from(shadow.querySelectorAll("p")).find((item) =>
      item.textContent?.includes("important passage"),
    )!;
    const text = paragraph.firstChild!;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 23);
    Object.defineProperty(range, "getBoundingClientRect", {
      value: () => new DOMRect(40, 60, 120, 20),
    });
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
      removeAllRanges: vi.fn(),
    } as unknown as Selection;
    Object.defineProperty(shadow, "getSelection", { value: () => selection });
    fireEvent.keyUp(paragraph, { key: "ArrowRight", shiftKey: true });
    const yellowButton = shadow.querySelector<HTMLButtonElement>(
      'button[aria-label="Highlight with yellow"]',
    );
    expect(yellowButton).toBeTruthy();
    expect(shadow.activeElement).toBe(yellowButton);
    fireEvent.click(yellowButton!);
    expect(shadow.querySelector("mark.rb-highlight--yellow")?.textContent).toBe(
      "important passage",
    );
    await vi.waitFor(() =>
      expect(JSON.stringify(backend.values[HIGHLIGHT_STORAGE_KEY])).toContain("important passage"),
    );

    await act(async () => unmountReader());
    await act(async () => mountReader(current));
    shadow = shadowRoot();
    expect(shadow.querySelector("mark.rb-highlight--yellow")?.textContent).toBe(
      "important passage",
    );
  });

  it("restores a persisted highlight in Document and Focus views and exposes the overview", async () => {
    const current = conversation();
    const highlight = storedHighlight(current);
    storage({
      [HIGHLIGHT_STORAGE_KEY]: {
        version: HIGHLIGHT_SCHEMA_VERSION,
        entries: [highlight],
      },
    });
    await act(async () => mountReader(current));
    const shadow = shadowRoot();
    expect(shadow.querySelector("mark[data-rb-highlight-id='reader-highlight']")?.textContent).toBe(
      "important passage",
    );

    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", { name: "Highlights (1)" }),
    );
    expect(
      within(shadow as unknown as HTMLElement).getByRole("heading", { name: "Highlights" }),
    ).toBeTruthy();
    expect(shadow.textContent).toContain("important passage");

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", { name: "Actions" }),
    );
    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", {
        name: "Copy conversation document",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Alpha important passage omega."),
    );
    expect(writeText.mock.calls[0][0]).not.toContain("yellow");
    expect(writeText.mock.calls[0][0]).not.toContain("reader-highlight");

    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", { name: "Focus" }),
    );
    expect(shadow.querySelector("mark[data-rb-highlight-id='reader-highlight']")?.textContent).toBe(
      "important passage",
    );
  });

  it("changes style, removes the record, and keeps deletion after remount", async () => {
    const current = conversation();
    const highlight = storedHighlight(current);
    const backend = storage({
      [HIGHLIGHT_STORAGE_KEY]: {
        version: HIGHLIGHT_SCHEMA_VERSION,
        entries: [highlight],
      },
    });
    await act(async () => mountReader(current));
    let shadow = shadowRoot();
    const mark = shadow.querySelector<HTMLElement>(
      "mark[data-rb-highlight-id='reader-highlight']",
    )!;
    fireEvent.click(mark);
    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", {
        name: "Change highlight to blue",
      }),
    );
    expect(shadow.querySelector("mark.rb-highlight--blue")).toBeTruthy();

    const updatedMark = shadow.querySelector<HTMLElement>(
      "mark[data-rb-highlight-id='reader-highlight']",
    )!;
    fireEvent.click(updatedMark);
    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", { name: "Remove" }),
    );
    await act(async () => unmountReader());
    await act(async () => mountReader(current));
    shadow = shadowRoot();
    expect(shadow.querySelector("mark[data-rb-highlight-id='reader-highlight']")).toBeNull();
    expect(JSON.stringify(backend.values[HIGHLIGHT_STORAGE_KEY])).not.toContain("reader-highlight");
  });
});
