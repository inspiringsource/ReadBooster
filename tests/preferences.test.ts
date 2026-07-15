import { describe, expect, it } from "vitest";

import {
  DEFAULT_READER_PREFERENCES,
  normalizeReaderPreferences,
  preferencesForPreset,
} from "../src/shared/preferences";

describe("reader preferences", () => {
  it("uses defaults for missing storage", () => {
    expect(normalizeReaderPreferences(undefined)).toEqual(DEFAULT_READER_PREFERENCES);
  });

  it("normalizes each invalid preference independently", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "sepia",
        textSize: "large",
        spacing: 42,
        preset: "dyslexia-friendly",
      }),
    ).toEqual({
      appearance: "system",
      textSize: "large",
      spacing: "roomy",
      preset: "dyslexia-friendly",
      codeAppearance: "color",
      documentOpenAt: "latest",
    });
  });

  it("applies the dyslexia-friendly visual preset without changing appearance", () => {
    expect(preferencesForPreset("dyslexia-friendly", "dark")).toEqual({
      appearance: "dark",
      textSize: "large",
      spacing: "roomy",
      preset: "dyslexia-friendly",
      codeAppearance: "color",
      documentOpenAt: "latest",
    });
  });

  it("keeps the comfortable preset internally consistent", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "light",
        textSize: "x-large",
        spacing: "roomy",
        preset: "comfortable",
      }),
    ).toEqual({
      appearance: "light",
      textSize: "medium",
      spacing: "comfortable",
      preset: "comfortable",
      codeAppearance: "color",
      documentOpenAt: "latest",
    });
  });

  it("migrates older preferences and preserves independent code and opening settings", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "dark",
        textSize: "small",
        spacing: "compact",
        preset: "custom",
        codeAppearance: "plain",
        documentOpenAt: "beginning",
      }),
    ).toEqual({
      appearance: "dark",
      textSize: "small",
      spacing: "compact",
      preset: "custom",
      codeAppearance: "plain",
      documentOpenAt: "beginning",
    });

    expect(
      preferencesForPreset("comfortable", "light", {
        codeAppearance: "plain",
        documentOpenAt: "beginning",
      }),
    ).toMatchObject({ codeAppearance: "plain", documentOpenAt: "beginning" });
  });
});
