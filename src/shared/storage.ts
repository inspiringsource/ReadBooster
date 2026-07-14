import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences } from "./preferences";
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
