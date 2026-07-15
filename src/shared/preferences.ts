import type {
  AppearanceMode,
  CodeAppearance,
  DocumentOpenAt,
  ReaderPreferences,
  ReaderPreset,
  SpacingLevel,
  TextSize,
} from "./types";

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  appearance: "system",
  textSize: "medium",
  spacing: "comfortable",
  preset: "comfortable",
  codeAppearance: "color",
  documentOpenAt: "latest",
};

const APPEARANCE_MODES: readonly AppearanceMode[] = ["system", "light", "dark"];
const TEXT_SIZES: readonly TextSize[] = ["small", "medium", "large", "x-large"];
const SPACING_LEVELS: readonly SpacingLevel[] = ["compact", "comfortable", "roomy"];
const READER_PRESETS: readonly ReaderPreset[] = ["comfortable", "dyslexia-friendly", "custom"];
const CODE_APPEARANCES: readonly CodeAppearance[] = ["color", "plain"];
const DOCUMENT_OPEN_POSITIONS: readonly DocumentOpenAt[] = ["latest", "beginning"];

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
  const preset = isAllowed(candidate.preset, READER_PRESETS)
    ? candidate.preset
    : DEFAULT_READER_PREFERENCES.preset;
  const codeAppearance = isAllowed(candidate.codeAppearance, CODE_APPEARANCES)
    ? candidate.codeAppearance
    : DEFAULT_READER_PREFERENCES.codeAppearance;
  const documentOpenAt = isAllowed(candidate.documentOpenAt, DOCUMENT_OPEN_POSITIONS)
    ? candidate.documentOpenAt
    : DEFAULT_READER_PREFERENCES.documentOpenAt;

  if (preset !== "custom") {
    return preferencesForPreset(preset, appearance, { codeAppearance, documentOpenAt });
  }

  return {
    appearance,
    textSize: isAllowed(candidate.textSize, TEXT_SIZES)
      ? candidate.textSize
      : DEFAULT_READER_PREFERENCES.textSize,
    spacing: isAllowed(candidate.spacing, SPACING_LEVELS)
      ? candidate.spacing
      : DEFAULT_READER_PREFERENCES.spacing,
    preset,
    codeAppearance,
    documentOpenAt,
  };
}

export function preferencesForPreset(
  preset: Exclude<ReaderPreset, "custom">,
  appearance: AppearanceMode,
  independent: Pick<ReaderPreferences, "codeAppearance" | "documentOpenAt"> = {
    codeAppearance: DEFAULT_READER_PREFERENCES.codeAppearance,
    documentOpenAt: DEFAULT_READER_PREFERENCES.documentOpenAt,
  },
): ReaderPreferences {
  if (preset === "dyslexia-friendly") {
    return { appearance, textSize: "large", spacing: "roomy", preset, ...independent };
  }

  return { appearance, textSize: "medium", spacing: "comfortable", preset, ...independent };
}
