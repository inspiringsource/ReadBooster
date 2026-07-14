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
      spacing: "comfortable",
      preset: "dyslexia-friendly",
    });
  });

  it("applies the dyslexia-friendly visual preset without changing appearance", () => {
    expect(preferencesForPreset("dyslexia-friendly", "dark")).toEqual({
      appearance: "dark",
      textSize: "large",
      spacing: "roomy",
      preset: "dyslexia-friendly",
    });
  });
});
