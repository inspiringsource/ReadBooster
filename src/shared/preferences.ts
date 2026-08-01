import type {
  AppearanceMode,
  CodeAppearance,
  DocumentOpenAt,
  GuidedReadingMode,
  ReadingFont,
  ReaderPreferences,
  SpacingLevel,
  TextSize,
} from "./types";

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  appearance: "system",
  textSize: "medium",
  spacing: "comfortable",
  readingFont: "default",
  codeAppearance: "color",
  documentOpenAt: "latest",
  guidedReading: "off",
};

const APPEARANCE_MODES: readonly AppearanceMode[] = ["system", "light", "dark"];
const TEXT_SIZES: readonly TextSize[] = ["small", "medium", "large", "x-large"];
const SPACING_LEVELS: readonly SpacingLevel[] = ["compact", "comfortable", "roomy"];
const READING_FONTS: readonly ReadingFont[] = [
  "default",
  "serif",
  "dyslexia-friendly",
  "fast-reading",
];
const CODE_APPEARANCES: readonly CodeAppearance[] = ["color", "plain"];
const DOCUMENT_OPEN_POSITIONS: readonly DocumentOpenAt[] = ["latest", "beginning"];
const GUIDED_READING_MODES: readonly GuidedReadingMode[] = ["off", "soft", "focused"];

function isAllowed<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

export function normalizeReaderPreferences(value: unknown): ReaderPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_READER_PREFERENCES };
  }

  const candidate = value as Record<string, unknown>;
  const appearance = isAllowed(candidate.appearance, APPEARANCE_MODES)
    ? candidate.appearance
    : DEFAULT_READER_PREFERENCES.appearance;
  const codeAppearance = isAllowed(candidate.codeAppearance, CODE_APPEARANCES)
    ? candidate.codeAppearance
    : DEFAULT_READER_PREFERENCES.codeAppearance;
  const documentOpenAt = isAllowed(candidate.documentOpenAt, DOCUMENT_OPEN_POSITIONS)
    ? candidate.documentOpenAt
    : DEFAULT_READER_PREFERENCES.documentOpenAt;
  const explicitReadingFont = isAllowed(candidate.readingFont, READING_FONTS)
    ? candidate.readingFont
    : null;
  // 0.5.3 previously stored a multi-setting preset. Preserve every independent
  // preference, and use the preset only as a migration hint when no valid
  // explicit reading style exists.
  const readingFont =
    candidate.preset === "dyslexia-friendly" &&
    (explicitReadingFont === null || explicitReadingFont === "default")
      ? "dyslexia-friendly"
      : (explicitReadingFont ?? DEFAULT_READER_PREFERENCES.readingFont);

  return {
    appearance,
    textSize: isAllowed(candidate.textSize, TEXT_SIZES)
      ? candidate.textSize
      : DEFAULT_READER_PREFERENCES.textSize,
    spacing: isAllowed(candidate.spacing, SPACING_LEVELS)
      ? candidate.spacing
      : DEFAULT_READER_PREFERENCES.spacing,
    readingFont,
    codeAppearance,
    documentOpenAt,
    guidedReading: isAllowed(candidate.guidedReading, GUIDED_READING_MODES)
      ? candidate.guidedReading
      : DEFAULT_READER_PREFERENCES.guidedReading,
  };
}
