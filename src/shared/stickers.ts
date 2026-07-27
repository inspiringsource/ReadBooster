import type { ConversationDocument, DocumentContentBlock } from "./types";

export const STICKER_STORAGE_KEY = "stickers:v1";
export const STICKER_SCHEMA_VERSION = 1;
export const STICKER_TEXT_MAX_LENGTH = 1_000;
export const MAXIMUM_STORED_STICKERS = 5_000;

export interface StickerPosition {
  readonly xRatio: number;
  readonly yRatio: number;
}

export interface Sticker {
  readonly id: string;
  readonly conversationKey: string;
  readonly sectionKey: string;
  readonly text: string;
  readonly position: StickerPosition;
  readonly isPinned: boolean;
  readonly isCollapsed: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly schemaVersion: typeof STICKER_SCHEMA_VERSION;
}

export interface StickerStore {
  readonly version: typeof STICKER_SCHEMA_VERSION;
  readonly entries: readonly Sticker[];
}

export interface StickerSectionIdentity {
  readonly conversationKey: string;
  readonly sectionKey: string;
  readonly persistable: boolean;
  readonly persistence: "stable" | "fallback" | "session";
}

export interface StickerConversationIdentity {
  readonly conversationKey: string;
  readonly persistable: boolean;
  readonly persistence: "stable" | "session";
}

const MAXIMUM_STABLE_KEY_LENGTH = 512;
const UNSAFE_ASSOCIATION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
    normalized.length > 0 &&
    normalized.length <= MAXIMUM_STABLE_KEY_LENGTH &&
    !UNSAFE_ASSOCIATION_KEYS.has(normalized)
  );
}

function conversationIdFromSourceUrl(conversation: ConversationDocument): string | null {
  try {
    const url = new URL(conversation.sourceUrl);
    let match: RegExpMatchArray | null = null;
    if (
      conversation.source === "chatgpt" &&
      (url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com"))
    ) {
      match = url.pathname.match(/^\/c\/([^/?#]+)/);
    } else if (conversation.source === "gemini" && url.hostname === "gemini.google.com") {
      match = url.pathname.match(/^\/app\/([^/?#]+)/);
    } else if (conversation.source === "mistral" && url.hostname === "chat.mistral.ai") {
      match = url.pathname.match(/^\/(?:chat|work)\/([^/?#]+)/);
    } else if (conversation.source === "claude" && url.hostname === "claude.ai") {
      match = url.pathname.match(/^\/chat\/([^/?#]+)/);
    }
    const routeId = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
    return validKey(routeId) && !/^(?:new|login|signup)$/i.test(routeId) ? routeId : null;
  } catch {
    return null;
  }
}

/**
 * Sticker persistence uses one document key for both save and restoration. Adapter provenance is
 * preferred, while verified public conversation routes recover when a mounted response omitted
 * conversation metadata. Titles and response content are never conversation identities.
 */
export function stickerConversationIdentity(
  conversation: ConversationDocument,
): StickerConversationIdentity {
  const sourceConversationIds = new Set(
    conversation.turns.flatMap((turn) =>
      [turn.prompt, turn.response].flatMap(
        (block) => block?.provenance.sourceConversationId?.trim() || [],
      ),
    ),
  );
  if (sourceConversationIds.size <= 1) {
    const provenanceId = sourceConversationIds.values().next().value;
    const conversationId = validKey(provenanceId)
      ? provenanceId
      : conversationIdFromSourceUrl(conversation);
    if (conversationId) {
      return {
        conversationKey: `${conversation.source}:${conversationId}`,
        persistable: true,
        persistence: "stable",
      };
    }
  }

  return {
    conversationKey: `session:${conversation.source}:${conversation.id}`,
    persistable: false,
    persistence: "session",
  };
}

export function clampStickerRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeStickerPosition(value: unknown): StickerPosition {
  if (!isRecord(value)) {
    return { xRatio: 1, yRatio: 0 };
  }
  return {
    xRatio: clampStickerRatio(typeof value.xRatio === "number" ? value.xRatio : 1),
    yRatio: clampStickerRatio(typeof value.yRatio === "number" ? value.yRatio : 0),
  };
}

export function normalizeStickerText(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > STICKER_TEXT_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

export function stickerSectionIdentity(
  conversation: ConversationDocument,
  response: DocumentContentBlock,
): StickerSectionIdentity {
  const conversationIdentity = stickerConversationIdentity(conversation);
  const sourceMessageId = response.provenance.sourceMessageId?.trim();
  if (conversationIdentity.persistable && validKey(sourceMessageId)) {
    return {
      conversationKey: conversationIdentity.conversationKey,
      sectionKey: `${response.provenance.platform}:${sourceMessageId}`,
      persistable: true,
      persistence: "stable",
    };
  }

  // Gemini and other supported DOMs do not always expose a source message ID. The normalized
  // fingerprint is deterministic for the same response and contains no message text. An
  // occurrence suffix keeps identical responses distinct without relying on their section title.
  const fingerprint = response.provenance.contentFingerprint?.trim();
  if (conversationIdentity.persistable && validKey(fingerprint)) {
    const matchingResponses = conversation.turns
      .flatMap((turn) => (turn.response ? [turn.response] : []))
      .filter((candidate) => candidate.provenance.contentFingerprint?.trim() === fingerprint);
    const occurrence = Math.max(
      0,
      matchingResponses.findIndex(
        (candidate) => candidate === response || candidate.id === response.id,
      ),
    );
    return {
      conversationKey: conversationIdentity.conversationKey,
      sectionKey: `${response.provenance.platform}:fingerprint:${fingerprint}:${occurrence}`,
      persistable: true,
      persistence: "fallback",
    };
  }

  return {
    conversationKey: conversationIdentity.conversationKey,
    sectionKey: `session:${response.id}`,
    persistable: false,
    persistence: "session",
  };
}

export function createSticker(
  identity: StickerSectionIdentity,
  position: StickerPosition,
  now = Date.now(),
  id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sticker-${now}-${Math.random().toString(36).slice(2)}`,
): Sticker {
  return {
    id,
    conversationKey: identity.conversationKey,
    sectionKey: identity.sectionKey,
    text: "",
    position: normalizeStickerPosition(position),
    isPinned: false,
    isCollapsed: false,
    createdAt: now,
    updatedAt: now,
    schemaVersion: STICKER_SCHEMA_VERSION,
  };
}

export function normalizeStickerStore(value: unknown): StickerStore {
  if (
    !isRecord(value) ||
    value.version !== STICKER_SCHEMA_VERSION ||
    !Array.isArray(value.entries)
  ) {
    return { version: STICKER_SCHEMA_VERSION, entries: [] };
  }

  const entries: Sticker[] = [];
  const positions = new Map<string, number>();
  for (const candidate of value.entries.slice(0, MAXIMUM_STORED_STICKERS)) {
    if (!isRecord(candidate)) {
      continue;
    }
    const text = typeof candidate.text === "string" ? normalizeStickerText(candidate.text) : null;
    if (
      !validKey(candidate.id) ||
      !validKey(candidate.conversationKey) ||
      !validKey(candidate.sectionKey) ||
      !text ||
      typeof candidate.isPinned !== "boolean" ||
      typeof candidate.isCollapsed !== "boolean" ||
      typeof candidate.createdAt !== "number" ||
      !Number.isFinite(candidate.createdAt) ||
      typeof candidate.updatedAt !== "number" ||
      !Number.isFinite(candidate.updatedAt) ||
      candidate.schemaVersion !== STICKER_SCHEMA_VERSION
    ) {
      continue;
    }
    const sticker: Sticker = {
      id: candidate.id.trim(),
      conversationKey: candidate.conversationKey.trim(),
      sectionKey: candidate.sectionKey.trim(),
      text,
      position: normalizeStickerPosition(candidate.position),
      isPinned: candidate.isPinned,
      isCollapsed: candidate.isCollapsed,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      schemaVersion: STICKER_SCHEMA_VERSION,
    };
    const key = JSON.stringify([sticker.conversationKey, sticker.id]);
    const existing = positions.get(key);
    if (existing === undefined) {
      positions.set(key, entries.length);
      entries.push(sticker);
    } else if (entries[existing].updatedAt <= sticker.updatedAt) {
      entries[existing] = sticker;
    }
  }

  return { version: STICKER_SCHEMA_VERSION, entries };
}
