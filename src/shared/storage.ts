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
import { getExtensionApi } from "./extensionApi";

const READER_PREFERENCES_KEY = "readerPreferences";

function getLocalStorage(): chrome.storage.LocalStorageArea | null {
  return getExtensionApi()?.storage?.local ?? null;
}

export async function loadReaderPreferences(): Promise<ReaderPreferences> {
  const storage = getLocalStorage();
  if (!storage) {
    return { ...DEFAULT_READER_PREFERENCES };
  }

  try {
    const stored = await storage.get(READER_PREFERENCES_KEY);
    return normalizeReaderPreferences(stored[READER_PREFERENCES_KEY]);
  } catch {
    return { ...DEFAULT_READER_PREFERENCES };
  }
}

export async function saveReaderPreferences(preferences: ReaderPreferences): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const normalized = normalizeReaderPreferences(preferences);
  await storage.set({ [READER_PREFERENCES_KEY]: normalized });
}

export type SectionTitlePersistenceResult =
  "saved" | "removed" | "not-persistable" | "unavailable" | "failed";

export async function loadSectionTitleOverrides(
  conversation: ConversationDocument,
): Promise<Map<string, string>> {
  const conversationKey = persistedConversationTitleKey(conversation);
  const storage = getLocalStorage();
  if (!conversationKey || !storage) {
    return new Map();
  }

  try {
    const stored = await storage.get(SECTION_TITLE_OVERRIDES_STORAGE_KEY);
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

async function readOverrideEntries(
  storage: chrome.storage.LocalStorageArea,
): Promise<SectionTitleOverrideRecord[]> {
  const stored = await storage.get(SECTION_TITLE_OVERRIDES_STORAGE_KEY);
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
  const storage = getLocalStorage();
  if (!storage) {
    return "unavailable";
  }
  const title = normalizeCustomSectionTitle(value);
  if (!title) {
    return "failed";
  }

  try {
    const entries = await readOverrideEntries(storage);
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
    await storage.set({
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
  const storage = getLocalStorage();
  if (!storage) {
    return "unavailable";
  }

  try {
    const entries = await readOverrideEntries(storage);
    const next = entries.filter(
      (entry) =>
        sectionTitleOverrideLookupKey(entry.conversationKey, entry.responseKey) !==
        identity.lookupKey,
    );
    await storage.set({
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
