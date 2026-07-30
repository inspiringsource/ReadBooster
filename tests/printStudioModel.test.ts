import { describe, expect, it } from "vitest";

import {
  createDefaultPrintStudioSettings,
  createPrintStudioDocument,
  movePrintSection,
  orderedPrintSections,
  printPageSetup,
} from "../src/reader/printStudio/printStudioModel";
import type { ConversationSection } from "../src/reader/presentation";
import type { HighlightRecord } from "../src/shared/highlights";
import type { Sticker } from "../src/shared/stickers";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function block(id: string, role: "user" | "assistant"): DocumentContentBlock {
  return {
    id,
    role,
    html: `<p>${id}</p>`,
    text: id,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/print-model",
      sourceConversationId: "print-model",
      sourceMessageId: id,
      extractedAt: "2026-07-30T08:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function fixture() {
  const firstResponse = block("response-1", "assistant");
  const secondResponse = block("response-2", "assistant");
  const sections: ConversationSection[] = [
    {
      id: "section-1",
      turnId: "turn-1",
      responseBlockId: firstResponse.id,
      index: 0,
      automaticTitle: "First",
      title: "First",
      titleSource: "heading",
      hasCustomTitle: false,
      prompt: block("prompt-1", "user"),
      response: firstResponse,
      outline: [],
    },
    {
      id: "section-2",
      turnId: "turn-2",
      responseBlockId: secondResponse.id,
      index: 1,
      automaticTitle: "Second",
      title: "Renamed second",
      titleSource: "prompt",
      hasCustomTitle: true,
      prompt: null,
      response: secondResponse,
      outline: [],
    },
  ];
  const conversation: ConversationDocument = {
    id: "print-model",
    source: "chatgpt",
    title: "Print model",
    sourceUrl: "https://chatgpt.com/c/print-model",
    extractedAt: "2026-07-30T08:00:00.000Z",
    turns: [],
  };
  const sticker: Sticker = {
    id: "sticker-1",
    conversationKey: "chatgpt:print-model",
    sectionKey: "chatgpt:response-1",
    text: "Review this conclusion",
    position: { xRatio: 1, yRatio: 0.25 },
    isPinned: true,
    isCollapsed: true,
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 1,
  };
  const highlight: HighlightRecord = {
    id: "highlight-1",
    conversationKey: "chatgpt:print-model",
    sectionKey: "chatgpt:response-1",
    blockId: "p:test:0",
    selectedText: "response",
    prefix: "",
    suffix: "-1",
    startOffset: 0,
    endOffset: 8,
    style: "blue",
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 1,
  };
  return {
    conversation,
    sections,
    stickers: new Map([["section-1", [sticker]]]),
    highlights: new Map([["section-1", [highlight]]]),
  };
}

describe("Print Studio model", () => {
  it("creates a separate snapshot with annotations and stable custom titles", () => {
    const current = fixture();
    const printDocument = createPrintStudioDocument(
      current.conversation,
      "Print model",
      current.sections,
      current.stickers,
      current.highlights,
    );
    expect(printDocument.sections).toHaveLength(2);
    expect(printDocument.sections[0].prompt?.text).toBe("prompt-1");
    expect(printDocument.sections[0].stickers[0].text).toBe("Review this conclusion");
    expect(printDocument.sections[0].highlights[0].style).toBe("blue");
    expect(printDocument.sections[1].title).toBe("Renamed second");
    expect(printDocument.sections).not.toBe(current.sections);
  });

  it("orders and filters sections without changing the source document", () => {
    const current = fixture();
    const printDocument = createPrintStudioDocument(
      current.conversation,
      "Print model",
      current.sections,
      current.stickers,
      current.highlights,
    );
    const defaults = createDefaultPrintStudioSettings(printDocument);
    const moved = movePrintSection(defaults.sectionOrder, "section-2", -1);
    const selected = orderedPrintSections(printDocument, {
      ...defaults,
      sectionOrder: moved,
      includedSectionIds: ["section-2"],
    });
    expect(selected.map((section) => section.id)).toEqual(["section-2"]);
    expect(defaults.sectionOrder).toEqual(["section-1", "section-2"]);
    expect(printDocument.sections.map((section) => section.id)).toEqual(["section-1", "section-2"]);
  });

  it("uses predictable page defaults and maps layout presets to browser print setup", () => {
    const current = fixture();
    const printDocument = createPrintStudioDocument(
      current.conversation,
      "Print model",
      current.sections,
      current.stickers,
      current.highlights,
    );
    const defaults = createDefaultPrintStudioSettings(printDocument);
    expect(defaults).toMatchObject({
      includePrompts: false,
      includeResponses: true,
      includeStickers: false,
      showHighlights: true,
      includeImages: true,
      pageSize: "a4",
      orientation: "portrait",
      margins: "standard",
    });
    expect(
      printPageSetup({
        ...defaults,
        pageSize: "letter",
        orientation: "landscape",
        margins: "comfortable",
      }),
    ).toEqual({ pageSize: "letter", orientation: "landscape", marginMillimeters: 18 });
  });
});
