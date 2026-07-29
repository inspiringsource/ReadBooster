import { getExtensionApi } from "./extensionApi";
import {
  HIGHLIGHT_SCHEMA_VERSION,
  HIGHLIGHT_STORAGE_KEY,
  highlightConversationIdentity,
  MAXIMUM_STORED_HIGHLIGHTS,
  normalizeHighlightStore,
  type HighlightRecord,
} from "./highlights";
import type { ConversationDocument } from "./types";

export type HighlightPersistenceResult =
  "saved" | "removed" | "not-persistable" | "unavailable" | "failed";

export interface HighlightLoadResult {
  readonly highlights: HighlightRecord[];
  readonly status: "loaded" | "not-persistable" | "unavailable" | "failed";
}

type StorageProvider = () => chrome.storage.LocalStorageArea | null;

function getLocalStorage(): chrome.storage.LocalStorageArea | null {
  return getExtensionApi()?.storage?.local ?? null;
}

export class BrowserHighlightRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storageProvider: StorageProvider = getLocalStorage) {}

  async load(conversation: ConversationDocument): Promise<HighlightLoadResult> {
    const identity = highlightConversationIdentity(conversation);
    if (!identity.persistable) {
      return { highlights: [], status: "not-persistable" };
    }
    const storage = this.storageProvider();
    if (!storage) {
      return { highlights: [], status: "unavailable" };
    }
    try {
      const stored = await storage.get(HIGHLIGHT_STORAGE_KEY);
      return {
        highlights: normalizeHighlightStore(stored[HIGHLIGHT_STORAGE_KEY]).entries.filter(
          (highlight) => highlight.conversationKey === identity.conversationKey,
        ),
        status: "loaded",
      };
    } catch {
      return { highlights: [], status: "failed" };
    }
  }

  private async updateStore(
    operation: (entries: HighlightRecord[]) => HighlightRecord[],
  ): Promise<HighlightPersistenceResult> {
    const storage = this.storageProvider();
    if (!storage) {
      return "unavailable";
    }
    try {
      const stored = await storage.get(HIGHLIGHT_STORAGE_KEY);
      const entries = [...normalizeHighlightStore(stored[HIGHLIGHT_STORAGE_KEY]).entries];
      await storage.set({
        [HIGHLIGHT_STORAGE_KEY]: {
          version: HIGHLIGHT_SCHEMA_VERSION,
          entries: operation(entries),
        },
      });
      return "saved";
    } catch {
      return "failed";
    }
  }

  private queue(
    operation: (entries: HighlightRecord[]) => HighlightRecord[],
  ): Promise<HighlightPersistenceResult> {
    const result = this.writeQueue.then(
      () => this.updateStore(operation),
      () => this.updateStore(operation),
    );
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async upsert(
    highlight: HighlightRecord,
    persistable: boolean,
  ): Promise<HighlightPersistenceResult> {
    if (!persistable) {
      return "not-persistable";
    }
    const normalized = normalizeHighlightStore({
      version: HIGHLIGHT_SCHEMA_VERSION,
      entries: [highlight],
    }).entries[0];
    if (!normalized) {
      return "failed";
    }
    return this.queue((entries) =>
      [
        ...entries.filter(
          (entry) =>
            entry.conversationKey !== normalized.conversationKey || entry.id !== normalized.id,
        ),
        normalized,
      ].slice(-MAXIMUM_STORED_HIGHLIGHTS),
    );
  }

  async remove(
    conversationKey: string,
    highlightId: string,
    persistable: boolean,
  ): Promise<HighlightPersistenceResult> {
    if (!persistable) {
      return "not-persistable";
    }
    const result = await this.queue((entries) =>
      entries.filter(
        (entry) => entry.conversationKey !== conversationKey || entry.id !== highlightId,
      ),
    );
    return result === "saved" ? "removed" : result;
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }
}

const highlightRepository = new BrowserHighlightRepository();

export function loadHighlightsWithStatus(
  conversation: ConversationDocument,
): Promise<HighlightLoadResult> {
  return highlightRepository.load(conversation);
}

export function saveHighlight(
  highlight: HighlightRecord,
  persistable: boolean,
): Promise<HighlightPersistenceResult> {
  return highlightRepository.upsert(highlight, persistable);
}

export function removeHighlight(
  conversationKey: string,
  highlightId: string,
  persistable: boolean,
): Promise<HighlightPersistenceResult> {
  return highlightRepository.remove(conversationKey, highlightId, persistable);
}

export function flushHighlightWrites(): Promise<void> {
  return highlightRepository.flush();
}
