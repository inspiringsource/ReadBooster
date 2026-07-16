import type { ConversationDocument, DocumentContentBlock } from "./types";

export const SECTION_TITLE_OVERRIDES_STORAGE_KEY = "sectionTitleOverrides:v1";
export const SECTION_TITLE_OVERRIDES_SCHEMA_VERSION = 1;
export const CUSTOM_SECTION_TITLE_MAX_LENGTH = 120;

const MAXIMUM_STABLE_KEY_LENGTH = 512;
const MAXIMUM_STORED_OVERRIDES = 5_000;
const UNSAFE_ASSOCIATION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface SectionTitleOverrideRecord {
  readonly conversationKey: string;
  readonly responseKey: string;
  readonly title: string;
}

export interface SectionTitleOverrideStore {
  readonly version: typeof SECTION_TITLE_OVERRIDES_SCHEMA_VERSION;
  readonly entries: readonly SectionTitleOverrideRecord[];
}

export interface SectionTitleOverrideIdentity {
  readonly conversationKey: string;
  readonly responseKey: string;
  readonly lookupKey: string;
  readonly persistable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validAssociationKey(value: unknown): value is string {
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

export function normalizeCustomSectionTitle(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > CUSTOM_SECTION_TITLE_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

export function sectionTitleOverrideLookupKey(
  conversationKey: string,
  responseKey: string,
): string {
  return JSON.stringify([conversationKey, responseKey]);
}

function stableConversationKey(conversation: ConversationDocument): string | null {
  const sourceConversationIds = new Set(
    conversation.turns.flatMap((turn) =>
      [turn.prompt, turn.response].flatMap(
        (block) => block?.provenance.sourceConversationId?.trim() || [],
      ),
    ),
  );
  if (sourceConversationIds.size !== 1) {
    return null;
  }
  const sourceConversationId = sourceConversationIds.values().next().value;
  if (!validAssociationKey(sourceConversationId)) {
    return null;
  }
  return `${conversation.source}:${sourceConversationId}`;
}

/**
 * Cross-session persistence requires both stable source identities. The session fallback follows
 * a normalized response through merges without risking a cross-session match to another message.
 */
export function sectionTitleOverrideIdentity(
  conversation: ConversationDocument,
  response: DocumentContentBlock,
): SectionTitleOverrideIdentity {
  const conversationKey = stableConversationKey(conversation);
  const sourceMessageId = response.provenance.sourceMessageId?.trim();
  if (conversationKey && validAssociationKey(sourceMessageId)) {
    const responseKey = `${response.provenance.platform}:${sourceMessageId}`;
    return {
      conversationKey,
      responseKey,
      lookupKey: sectionTitleOverrideLookupKey(conversationKey, responseKey),
      persistable: true,
    };
  }

  const sessionConversationKey = `session:${conversation.source}:${conversation.id}`;
  const sessionResponseKey = `session:${response.id}`;
  return {
    conversationKey: sessionConversationKey,
    responseKey: sessionResponseKey,
    lookupKey: sectionTitleOverrideLookupKey(sessionConversationKey, sessionResponseKey),
    persistable: false,
  };
}

export function persistedConversationTitleKey(conversation: ConversationDocument): string | null {
  return stableConversationKey(conversation);
}

export function normalizeSectionTitleOverrideStore(value: unknown): SectionTitleOverrideStore {
  if (
    !isRecord(value) ||
    value.version !== SECTION_TITLE_OVERRIDES_SCHEMA_VERSION ||
    !Array.isArray(value.entries)
  ) {
    return { version: SECTION_TITLE_OVERRIDES_SCHEMA_VERSION, entries: [] };
  }

  const entries: SectionTitleOverrideRecord[] = [];
  const positions = new Map<string, number>();
  for (const candidate of value.entries.slice(0, MAXIMUM_STORED_OVERRIDES)) {
    if (!isRecord(candidate)) {
      continue;
    }
    const { conversationKey, responseKey } = candidate;
    const title =
      typeof candidate.title === "string" ? normalizeCustomSectionTitle(candidate.title) : null;
    if (!validAssociationKey(conversationKey) || !validAssociationKey(responseKey) || !title) {
      continue;
    }
    const record = {
      conversationKey: conversationKey.trim(),
      responseKey: responseKey.trim(),
      title,
    };
    const lookupKey = sectionTitleOverrideLookupKey(record.conversationKey, record.responseKey);
    const existingPosition = positions.get(lookupKey);
    if (existingPosition === undefined) {
      positions.set(lookupKey, entries.length);
      entries.push(record);
    } else {
      entries[existingPosition] = record;
    }
  }

  return { version: SECTION_TITLE_OVERRIDES_SCHEMA_VERSION, entries };
}
