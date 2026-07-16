import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences } from "./preferences";
import {
  normalizeCustomSectionTitle,
  normalizeSectionTitleOverrideStore,
  persistedConversationTitleKey,
  SECTION_TITLE_OVERRIDES_SCHEMA_VERSION,
  SECTION_TITLE_OVERRIDES_STORAGE_KEY,
  sectionTitleOverrideIdentity,
  sectionTitleOverrideLookupKey,
  type SectionTitleOverrideRecord,
} from "./sectionTitleOverrides";
import type { ConversationDocument, DocumentContentBlock } from "./types";
import type { ReaderPreferences } from "./types";

const READER_PREFERENCES_KEY = "readerPreferences";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export async function loadReaderPreferences(): Promise<ReaderPreferences> {
  if (!hasChromeStorage()) {
    return { ...DEFAULT_READER_PREFERENCES };
  }

  try {
    const stored = await chrome.storage.local.get(READER_PREFERENCES_KEY);
    return normalizeReaderPreferences(stored[READER_PREFERENCES_KEY]);
  } catch {
    return { ...DEFAULT_READER_PREFERENCES };
  }
}

export async function saveReaderPreferences(preferences: ReaderPreferences): Promise<void> {
  if (!hasChromeStorage()) {
    return;
  }

  const normalized = normalizeReaderPreferences(preferences);
  await chrome.storage.local.set({ [READER_PREFERENCES_KEY]: normalized });
}

export type SectionTitlePersistenceResult =
  "saved" | "removed" | "not-persistable" | "unavailable" | "failed";

export async function loadSectionTitleOverrides(
  conversation: ConversationDocument,
): Promise<Map<string, string>> {
  const conversationKey = persistedConversationTitleKey(conversation);
  if (!conversationKey || !hasChromeStorage()) {
    return new Map();
  }

  try {
    const stored = await chrome.storage.local.get(SECTION_TITLE_OVERRIDES_STORAGE_KEY);
    const normalized = normalizeSectionTitleOverrideStore(
      stored[SECTION_TITLE_OVERRIDES_STORAGE_KEY],
    );
    return new Map(
      normalized.entries
        .filter((entry) => entry.conversationKey === conversationKey)
        .map((entry) => [
          sectionTitleOverrideLookupKey(entry.conversationKey, entry.responseKey),
          entry.title,
        ]),
    );
  } catch {
    return new Map();
  }
}

async function readOverrideEntries(): Promise<SectionTitleOverrideRecord[]> {
  const stored = await chrome.storage.local.get(SECTION_TITLE_OVERRIDES_STORAGE_KEY);
  return [
    ...normalizeSectionTitleOverrideStore(stored[SECTION_TITLE_OVERRIDES_STORAGE_KEY]).entries,
  ];
}

export async function saveSectionTitleOverride(
  conversation: ConversationDocument,
  response: DocumentContentBlock,
  value: string,
): Promise<SectionTitlePersistenceResult> {
  const identity = sectionTitleOverrideIdentity(conversation, response);
  if (!identity.persistable) {
    return "not-persistable";
  }
  if (!hasChromeStorage()) {
    return "unavailable";
  }
  const title = normalizeCustomSectionTitle(value);
  if (!title) {
    return "failed";
  }

  try {
    const entries = await readOverrideEntries();
    const lookupKey = identity.lookupKey;
    const next = entries.filter(
      (entry) =>
        sectionTitleOverrideLookupKey(entry.conversationKey, entry.responseKey) !== lookupKey,
    );
    next.push({
      conversationKey: identity.conversationKey,
      responseKey: identity.responseKey,
      title,
    });
    await chrome.storage.local.set({
      [SECTION_TITLE_OVERRIDES_STORAGE_KEY]: {
        version: SECTION_TITLE_OVERRIDES_SCHEMA_VERSION,
        entries: next,
      },
    });
    return "saved";
  } catch {
    return "failed";
  }
}

export async function removeSectionTitleOverride(
  conversation: ConversationDocument,
  response: DocumentContentBlock,
): Promise<SectionTitlePersistenceResult> {
  const identity = sectionTitleOverrideIdentity(conversation, response);
  if (!identity.persistable) {
    return "not-persistable";
  }
  if (!hasChromeStorage()) {
    return "unavailable";
  }

  try {
    const entries = await readOverrideEntries();
    const next = entries.filter(
      (entry) =>
        sectionTitleOverrideLookupKey(entry.conversationKey, entry.responseKey) !==
        identity.lookupKey,
    );
    await chrome.storage.local.set({
      [SECTION_TITLE_OVERRIDES_STORAGE_KEY]: {
        version: SECTION_TITLE_OVERRIDES_SCHEMA_VERSION,
        entries: next,
      },
    });
    return "removed";
  } catch {
    return "failed";
  }
}
