import type { ConversationDocument, DocumentContentBlock } from "./types";
import {
  stickerConversationIdentity,
  stickerSectionIdentity,
  type StickerSectionIdentity,
} from "./stickers";

export const HIGHLIGHT_STORAGE_KEY = "highlights:v1";
export const HIGHLIGHT_SCHEMA_VERSION = 1;
export const HIGHLIGHT_CONTEXT_LENGTH = 64;
export const HIGHLIGHT_TEXT_MAX_LENGTH = 4_000;
export const MAXIMUM_STORED_HIGHLIGHTS = 5_000;

export const HIGHLIGHT_STYLES = ["yellow", "green", "blue", "pink"] as const;
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];

export interface HighlightAnchor {
  readonly blockId: string;
  readonly selectedText: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface HighlightRecord extends HighlightAnchor {
  readonly id: string;
  readonly conversationKey: string;
  readonly sectionKey: string;
  readonly style: HighlightStyle;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly schemaVersion: typeof HIGHLIGHT_SCHEMA_VERSION;
}

export interface HighlightStore {
  readonly version: typeof HIGHLIGHT_SCHEMA_VERSION;
  readonly entries: readonly HighlightRecord[];
}

const MAXIMUM_KEY_LENGTH = 512;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validKey(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  return (
    normalized.length > 0 && normalized.length <= MAXIMUM_KEY_LENGTH && !UNSAFE_KEYS.has(normalized)
  );
}

export function isHighlightStyle(value: unknown): value is HighlightStyle {
  return typeof value === "string" && HIGHLIGHT_STYLES.includes(value as HighlightStyle);
}

export function normalizeHighlightText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\r\n?/g, "\n");
  return normalized.trim() && normalized.length <= HIGHLIGHT_TEXT_MAX_LENGTH ? normalized : null;
}

export function highlightConversationIdentity(conversation: ConversationDocument) {
  return stickerConversationIdentity(conversation);
}

export function highlightSectionIdentity(
  conversation: ConversationDocument,
  response: DocumentContentBlock,
): StickerSectionIdentity {
  return stickerSectionIdentity(conversation, response);
}

export function createHighlight(
  identity: StickerSectionIdentity,
  anchor: HighlightAnchor,
  style: HighlightStyle,
  now = Date.now(),
  id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `highlight-${now}-${Math.random().toString(36).slice(2)}`,
): HighlightRecord {
  return {
    id,
    conversationKey: identity.conversationKey,
    sectionKey: identity.sectionKey,
    blockId: anchor.blockId,
    selectedText: anchor.selectedText,
    prefix: anchor.prefix,
    suffix: anchor.suffix,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
    style,
    createdAt: now,
    updatedAt: now,
    schemaVersion: HIGHLIGHT_SCHEMA_VERSION,
  };
}

export function normalizeHighlightStore(value: unknown): HighlightStore {
  if (
    !isRecord(value) ||
    value.version !== HIGHLIGHT_SCHEMA_VERSION ||
    !Array.isArray(value.entries)
  ) {
    return { version: HIGHLIGHT_SCHEMA_VERSION, entries: [] };
  }

  const entries: HighlightRecord[] = [];
  const positions = new Map<string, number>();
  for (const candidate of value.entries.slice(0, MAXIMUM_STORED_HIGHLIGHTS)) {
    if (!isRecord(candidate)) {
      continue;
    }
    const selectedText = normalizeHighlightText(candidate.selectedText);
    if (
      !validKey(candidate.id) ||
      !validKey(candidate.conversationKey) ||
      !validKey(candidate.sectionKey) ||
      !validKey(candidate.blockId) ||
      !selectedText ||
      typeof candidate.prefix !== "string" ||
      typeof candidate.suffix !== "string" ||
      candidate.prefix.length > HIGHLIGHT_CONTEXT_LENGTH ||
      candidate.suffix.length > HIGHLIGHT_CONTEXT_LENGTH ||
      typeof candidate.startOffset !== "number" ||
      !Number.isInteger(candidate.startOffset) ||
      candidate.startOffset < 0 ||
      typeof candidate.endOffset !== "number" ||
      !Number.isInteger(candidate.endOffset) ||
      candidate.endOffset <= candidate.startOffset ||
      candidate.endOffset - candidate.startOffset !== selectedText.length ||
      !isHighlightStyle(candidate.style) ||
      typeof candidate.createdAt !== "number" ||
      !Number.isFinite(candidate.createdAt) ||
      typeof candidate.updatedAt !== "number" ||
      !Number.isFinite(candidate.updatedAt) ||
      candidate.schemaVersion !== HIGHLIGHT_SCHEMA_VERSION
    ) {
      continue;
    }
    const highlight: HighlightRecord = {
      id: candidate.id.trim(),
      conversationKey: candidate.conversationKey.trim(),
      sectionKey: candidate.sectionKey.trim(),
      blockId: candidate.blockId.trim(),
      selectedText,
      prefix: candidate.prefix,
      suffix: candidate.suffix,
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
      style: candidate.style,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      schemaVersion: HIGHLIGHT_SCHEMA_VERSION,
    };
    const key = `${highlight.conversationKey}\u0000${highlight.id}`;
    const existingIndex = positions.get(key);
    if (existingIndex === undefined) {
      positions.set(key, entries.length);
      entries.push(highlight);
    } else if (entries[existingIndex].updatedAt <= highlight.updatedAt) {
      entries[existingIndex] = highlight;
    }
  }
  return { version: HIGHLIGHT_SCHEMA_VERSION, entries };
}

export type HighlightInsertionResult =
  | {
      readonly kind: "created";
      readonly highlight: HighlightRecord;
      readonly removeIds: readonly string[];
    }
  | {
      readonly kind: "merged";
      readonly highlight: HighlightRecord;
      readonly removeIds: readonly string[];
    }
  | { readonly kind: "overlap" };

export function resolveHighlightInsertion(
  existing: readonly HighlightRecord[],
  identity: StickerSectionIdentity,
  anchor: HighlightAnchor,
  style: HighlightStyle,
  blockText: string,
  now = Date.now(),
  id?: string,
): HighlightInsertionResult {
  const sameBlock = existing.filter(
    (highlight) =>
      highlight.conversationKey === identity.conversationKey &&
      highlight.sectionKey === identity.sectionKey &&
      highlight.blockId === anchor.blockId,
  );
  const overlapping = sameBlock.filter(
    (highlight) =>
      anchor.startOffset < highlight.endOffset && anchor.endOffset > highlight.startOffset,
  );
  if (overlapping.length > 0) {
    return { kind: "overlap" };
  }

  const adjacent = sameBlock.filter(
    (highlight) =>
      highlight.style === style &&
      (highlight.endOffset === anchor.startOffset || anchor.endOffset === highlight.startOffset),
  );
  if (adjacent.length === 0) {
    return {
      kind: "created",
      highlight: createHighlight(identity, anchor, style, now, id),
      removeIds: [],
    };
  }

  const startOffset = Math.min(anchor.startOffset, ...adjacent.map((item) => item.startOffset));
  const endOffset = Math.max(anchor.endOffset, ...adjacent.map((item) => item.endOffset));
  const selectedText = blockText.slice(startOffset, endOffset);
  const mergedAnchor: HighlightAnchor = {
    blockId: anchor.blockId,
    selectedText,
    prefix: blockText.slice(Math.max(0, startOffset - HIGHLIGHT_CONTEXT_LENGTH), startOffset),
    suffix: blockText.slice(endOffset, endOffset + HIGHLIGHT_CONTEXT_LENGTH),
    startOffset,
    endOffset,
  };
  const primary = adjacent.slice().sort((left, right) => left.createdAt - right.createdAt)[0];
  return {
    kind: "merged",
    highlight: {
      ...createHighlight(identity, mergedAnchor, style, now, primary.id),
      createdAt: primary.createdAt,
    },
    removeIds: adjacent.filter((item) => item.id !== primary.id).map((item) => item.id),
  };
}
