import { describe, expect, it } from "vitest";

import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences } from "../src/shared/preferences";

describe("reader preferences", () => {
  it("uses unchanged defaults for missing storage", () => {
    expect(normalizeReaderPreferences(undefined)).toEqual(DEFAULT_READER_PREFERENCES);
    expect(DEFAULT_READER_PREFERENCES.readingFont).toBe("default");
    expect(DEFAULT_READER_PREFERENCES).not.toHaveProperty("preset");
  });

  it("normalizes each invalid value independently", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "sepia",
        textSize: "large",
        spacing: 42,
        readingFont: "unknown-font",
        codeAppearance: "plain",
        documentOpenAt: "beginning",
      }),
    ).toEqual({
      appearance: "system",
      textSize: "large",
      spacing: "comfortable",
      readingFont: "default",
      codeAppearance: "plain",
      documentOpenAt: "beginning",
    });
  });

  it.each(["default", "serif", "dyslexia-friendly", "fast-reading"] as const)(
    "accepts the %s reading style",
    (readingFont) => {
      expect(
        normalizeReaderPreferences({
          ...DEFAULT_READER_PREFERENCES,
          readingFont,
        }).readingFont,
      ).toBe(readingFont);
    },
  );

  it("migrates the former Comfortable preset without resetting explicit preferences", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "dark",
        textSize: "x-large",
        spacing: "roomy",
        preset: "comfortable",
        readingFont: "default",
        codeAppearance: "plain",
        documentOpenAt: "beginning",
      }),
    ).toEqual({
      appearance: "dark",
      textSize: "x-large",
      spacing: "roomy",
      readingFont: "default",
      codeAppearance: "plain",
      documentOpenAt: "beginning",
    });
  });

  it("migrates the former Dyslexia-friendly preset to the matching reading style", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "dark",
        textSize: "large",
        spacing: "roomy",
        preset: "dyslexia-friendly",
        readingFont: "default",
        codeAppearance: "plain",
        documentOpenAt: "beginning",
      }),
    ).toEqual({
      appearance: "dark",
      textSize: "large",
      spacing: "roomy",
      readingFont: "dyslexia-friendly",
      codeAppearance: "plain",
      documentOpenAt: "beginning",
    });
  });

  it("preserves an explicit style from the former Custom state", () => {
    expect(
      normalizeReaderPreferences({
        appearance: "light",
        textSize: "small",
        spacing: "compact",
        preset: "custom",
        readingFont: "fast-reading",
        codeAppearance: "color",
        documentOpenAt: "latest",
      }),
    ).toEqual({
      appearance: "light",
      textSize: "small",
      spacing: "compact",
      readingFont: "fast-reading",
      codeAppearance: "color",
      documentOpenAt: "latest",
    });
  });

  it("accepts the briefly stored dyslexia font value directly", () => {
    expect(
      normalizeReaderPreferences({
        ...DEFAULT_READER_PREFERENCES,
        preset: "custom",
        readingFont: "dyslexia-friendly",
      }),
    ).toEqual({
      ...DEFAULT_READER_PREFERENCES,
      readingFont: "dyslexia-friendly",
    });
  });
});
