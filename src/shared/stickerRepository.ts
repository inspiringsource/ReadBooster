import { getExtensionApi } from "./extensionApi";
import {
  MAXIMUM_STORED_STICKERS,
  normalizeStickerStore,
  stickerConversationIdentity,
  STICKER_SCHEMA_VERSION,
  STICKER_STORAGE_KEY,
  type Sticker,
} from "./stickers";
import type { ConversationDocument } from "./types";

export type StickerPersistenceResult =
  "saved" | "removed" | "not-persistable" | "unavailable" | "failed";

export type StickerLoadResult = {
  readonly stickers: Sticker[];
  readonly status: "loaded" | "not-persistable" | "unavailable" | "failed";
};

type StorageProvider = () => chrome.storage.LocalStorageArea | null;

function getLocalStorage(): chrome.storage.LocalStorageArea | null {
  return getExtensionApi()?.storage?.local ?? null;
}

export class BrowserStickerRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storageProvider: StorageProvider = getLocalStorage) {}

  async load(conversation: ConversationDocument): Promise<StickerLoadResult> {
    const identity = stickerConversationIdentity(conversation);
    if (!identity.persistable) {
      return { stickers: [], status: "not-persistable" };
    }
    const storage = this.storageProvider();
    if (!storage) {
      return { stickers: [], status: "unavailable" };
    }

    try {
      const stored = await storage.get(STICKER_STORAGE_KEY);
      return {
        stickers: normalizeStickerStore(stored[STICKER_STORAGE_KEY]).entries.filter(
          (sticker) => sticker.conversationKey === identity.conversationKey,
        ),
        status: "loaded",
      };
    } catch {
      return { stickers: [], status: "failed" };
    }
  }

  private async updateStore(
    operation: (entries: Sticker[]) => Sticker[],
  ): Promise<StickerPersistenceResult> {
    const storage = this.storageProvider();
    if (!storage) {
      return "unavailable";
    }
    try {
      const stored = await storage.get(STICKER_STORAGE_KEY);
      const entries = [...normalizeStickerStore(stored[STICKER_STORAGE_KEY]).entries];
      await storage.set({
        [STICKER_STORAGE_KEY]: {
          version: STICKER_SCHEMA_VERSION,
          entries: operation(entries),
        },
      });
      return "saved";
    } catch {
      return "failed";
    }
  }

  private queueStoreUpdate(
    operation: (entries: Sticker[]) => Sticker[],
  ): Promise<StickerPersistenceResult> {
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

  async upsert(sticker: Sticker, persistable: boolean): Promise<StickerPersistenceResult> {
    if (!persistable) {
      return "not-persistable";
    }
    const normalized = normalizeStickerStore({
      version: STICKER_SCHEMA_VERSION,
      entries: [sticker],
    }).entries[0];
    if (!normalized) {
      return "failed";
    }
    return this.queueStoreUpdate((entries) =>
      [
        ...entries.filter(
          (entry) =>
            entry.conversationKey !== normalized.conversationKey || entry.id !== normalized.id,
        ),
        normalized,
      ].slice(-MAXIMUM_STORED_STICKERS),
    );
  }

  async remove(
    conversationKey: string,
    stickerId: string,
    persistable: boolean,
  ): Promise<StickerPersistenceResult> {
    if (!persistable) {
      return "not-persistable";
    }
    const result = await this.queueStoreUpdate((entries) =>
      entries.filter(
        (entry) => entry.conversationKey !== conversationKey || entry.id !== stickerId,
      ),
    );
    return result === "saved" ? "removed" : result;
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }
}

const stickerRepository = new BrowserStickerRepository();

export async function loadStickersWithStatus(
  conversation: ConversationDocument,
): Promise<StickerLoadResult> {
  return stickerRepository.load(conversation);
}

export async function loadStickers(conversation: ConversationDocument): Promise<Sticker[]> {
  return (await loadStickersWithStatus(conversation)).stickers;
}

export async function saveSticker(
  sticker: Sticker,
  persistable: boolean,
): Promise<StickerPersistenceResult> {
  return stickerRepository.upsert(sticker, persistable);
}

export async function removeSticker(
  conversationKey: string,
  stickerId: string,
  persistable: boolean,
): Promise<StickerPersistenceResult> {
  return stickerRepository.remove(conversationKey, stickerId, persistable);
}

export async function flushStickerWrites(): Promise<void> {
  await stickerRepository.flush();
}
