import { describe, expect, it, vi } from "vitest";

import { getExtensionApi } from "../src/shared/extensionApi";
import { loadReaderPreferences, saveReaderPreferences } from "../src/shared/storage";
import { DEFAULT_READER_PREFERENCES } from "../src/shared/preferences";

describe("cross-browser extension API", () => {
  it("prefers Firefox's browser namespace when available", () => {
    const browserApi = { runtime: { getURL: vi.fn() } } as unknown as typeof chrome;
    const chromeApi = { runtime: { getURL: vi.fn() } } as unknown as typeof chrome;
    vi.stubGlobal("browser", browserApi);
    vi.stubGlobal("chrome", chromeApi);
    expect(getExtensionApi()).toBe(browserApi);
  });

  it("falls back to Chrome's namespace", () => {
    const chromeApi = { runtime: { getURL: vi.fn() } } as unknown as typeof chrome;
    vi.stubGlobal("chrome", chromeApi);
    expect(getExtensionApi()).toBe(chromeApi);
  });

  it("loads and saves preferences through Firefox Promise storage", async () => {
    const get = vi.fn().mockResolvedValue({
      readerPreferences: { ...DEFAULT_READER_PREFERENCES, readingFont: "serif" },
    });
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("browser", {
      storage: { local: { get, set } },
    });

    await expect(loadReaderPreferences()).resolves.toMatchObject({ readingFont: "serif" });
    await saveReaderPreferences({ ...DEFAULT_READER_PREFERENCES, readingFont: "fast-reading" });
    expect(get).toHaveBeenCalledWith("readerPreferences");
    expect(set).toHaveBeenCalledWith({
      readerPreferences: { ...DEFAULT_READER_PREFERENCES, readingFont: "fast-reading" },
    });
  });
});
