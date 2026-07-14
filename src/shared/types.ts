export type ExtractedResponseSource = "chatgpt" | "claude" | "gemini";

export interface ExtractedResponse {
  id: string;
  source: ExtractedResponseSource;
  html: string;
  text: string;
  extractedAt: string;
}

export type AppearanceMode = "system" | "light" | "dark";
export type TextSize = "small" | "medium" | "large" | "x-large";
export type SpacingLevel = "compact" | "comfortable" | "roomy";
export type ReaderPreset = "comfortable" | "dyslexia-friendly" | "custom";

export interface ReaderPreferences {
  appearance: AppearanceMode;
  textSize: TextSize;
  spacing: SpacingLevel;
  preset: ReaderPreset;
}
