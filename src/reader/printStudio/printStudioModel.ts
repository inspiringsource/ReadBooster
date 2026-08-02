import type { HighlightRecord } from "../../shared/highlights";
import type { Sticker } from "../../shared/stickers";
import type { ConversationDocument } from "../../shared/types";
import type { ConversationSection } from "../presentation";

export type PrintPageSize = "a4" | "letter";
export type PrintOrientation = "portrait" | "landscape";
export type PrintMarginPreset = "compact" | "standard" | "comfortable";
export type PrintFontPreset = "compact" | "standard" | "readable";
export type PrintSpacingPreset = "compact" | "standard" | "readable";
export type PrintWidthPreset = "narrow" | "standard" | "full";

export interface PrintStudioSticker {
  readonly id: string;
  readonly text: string;
}

export interface PrintStudioContentBlock {
  readonly id: string;
  readonly html: string;
  readonly text: string;
}

export interface PrintStudioSection {
  readonly id: string;
  readonly originalIndex: number;
  readonly title: string;
  readonly prompt: PrintStudioContentBlock | null;
  readonly response: PrintStudioContentBlock;
  readonly stickers: readonly PrintStudioSticker[];
  readonly highlights: readonly HighlightRecord[];
}

export interface PrintStudioDocument {
  readonly title: string;
  readonly source: ConversationDocument["source"];
  readonly sourceUrl: string;
  readonly sourceContext?: ConversationDocument["sourceContext"];
  readonly sections: readonly PrintStudioSection[];
}

export interface PrintStudioSettings {
  readonly includePrompts: boolean;
  readonly includeResponses: boolean;
  readonly includeStickers: boolean;
  readonly showHighlights: boolean;
  readonly includeImages: boolean;
  readonly includedSectionIds: readonly string[];
  readonly sectionOrder: readonly string[];
  readonly pageBreakBeforeIds: readonly string[];
  readonly pageSize: PrintPageSize;
  readonly orientation: PrintOrientation;
  readonly margins: PrintMarginPreset;
  readonly fontSize: PrintFontPreset;
  readonly lineSpacing: PrintSpacingPreset;
  readonly contentWidth: PrintWidthPreset;
}

export interface PrintPageSetup {
  readonly pageSize: PrintPageSize;
  readonly orientation: PrintOrientation;
  readonly marginMillimeters: number;
}

export const PRINT_MARGIN_MILLIMETERS: Record<PrintMarginPreset, number> = {
  compact: 8,
  standard: 12,
  comfortable: 18,
};

export const PRINT_FONT_POINTS: Record<PrintFontPreset, number> = {
  compact: 9.5,
  standard: 10.5,
  readable: 12,
};

export const PRINT_LINE_HEIGHTS: Record<PrintSpacingPreset, number> = {
  compact: 1.35,
  standard: 1.5,
  readable: 1.68,
};

export const PRINT_CONTENT_WIDTHS: Record<PrintWidthPreset, string> = {
  narrow: "68ch",
  standard: "82ch",
  full: "none",
};

export const PRINT_PREVIEW_WIDTHS: Record<PrintPageSize, Record<PrintOrientation, string>> = {
  a4: { portrait: "794px", landscape: "1123px" },
  letter: { portrait: "816px", landscape: "1056px" },
};

export function createPrintStudioDocument(
  conversation: ConversationDocument,
  title: string,
  sections: readonly ConversationSection[],
  stickersBySectionId: ReadonlyMap<string, readonly Sticker[]>,
  highlightsBySectionId: ReadonlyMap<string, readonly HighlightRecord[]>,
): PrintStudioDocument {
  return {
    title,
    source: conversation.source,
    sourceUrl: conversation.sourceUrl,
    sourceContext: conversation.sourceContext,
    sections: sections.map((section) => ({
      id: section.id,
      originalIndex: section.index,
      title: section.title,
      prompt: section.prompt
        ? { id: section.prompt.id, html: section.prompt.html, text: section.prompt.text }
        : null,
      response: {
        id: section.response.id,
        html: section.response.html,
        text: section.response.text,
      },
      stickers: (stickersBySectionId.get(section.id) ?? [])
        .filter((sticker) => sticker.text.trim())
        .map((sticker) => ({ id: sticker.id, text: sticker.text })),
      highlights: [...(highlightsBySectionId.get(section.id) ?? [])],
    })),
  };
}

export function createDefaultPrintStudioSettings(
  document: PrintStudioDocument,
): PrintStudioSettings {
  const sectionIds = document.sections.map((section) => section.id);
  return {
    includePrompts: false,
    includeResponses: true,
    includeStickers: false,
    showHighlights: true,
    includeImages: true,
    includedSectionIds: sectionIds,
    sectionOrder: sectionIds,
    pageBreakBeforeIds: [],
    pageSize: "a4",
    orientation: "portrait",
    margins: "standard",
    fontSize: "standard",
    lineSpacing: "standard",
    contentWidth: "standard",
  };
}

export function orderedPrintSections(
  document: PrintStudioDocument,
  settings: PrintStudioSettings,
): PrintStudioSection[] {
  const included = new Set(settings.includedSectionIds);
  const sections = new Map(document.sections.map((section) => [section.id, section]));
  return settings.sectionOrder.flatMap((id) => {
    const section = sections.get(id);
    return section && included.has(id) ? [section] : [];
  });
}

export function movePrintSection(
  order: readonly string[],
  sectionId: string,
  direction: -1 | 1,
): string[] {
  const currentIndex = order.indexOf(sectionId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) {
    return [...order];
  }
  const next = [...order];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}

export function printPageSetup(settings: PrintStudioSettings): PrintPageSetup {
  return {
    pageSize: settings.pageSize,
    orientation: settings.orientation,
    marginMillimeters: PRINT_MARGIN_MILLIMETERS[settings.margins],
  };
}
