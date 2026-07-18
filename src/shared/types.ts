export type ExtractedResponseSource = "chatgpt" | "claude" | "gemini";

export interface ExtractedResponse {
  id: string;
  source: ExtractedResponseSource;
  html: string;
  text: string;
  extractedAt: string;
}

export type ConversationRole = "user" | "assistant";

export interface SourceProvenance {
  readonly kind: "original";
  readonly platform: ExtractedResponseSource;
  readonly sourceUrl: string;
  readonly sourceConversationId?: string;
  readonly sourceMessageId?: string;
  readonly extractedAt: string;
  readonly contentFingerprint: string;
}

export interface DocumentContentBlock {
  readonly id: string;
  readonly role: ConversationRole;
  readonly html: string;
  readonly text: string;
  readonly provenance: SourceProvenance;
}

export interface ConversationTurn {
  readonly id: string;
  readonly index: number;
  readonly prompt: DocumentContentBlock | null;
  readonly response: DocumentContentBlock | null;
}

export interface ConversationDocument {
  readonly id: string;
  readonly source: ExtractedResponseSource;
  readonly title: string | null;
  readonly sourceUrl: string;
  readonly extractedAt: string;
  readonly turns: readonly ConversationTurn[];
}

export type ConversationScanTerminationReason =
  | "bottom"
  | "aborted"
  | "failed"
  | "identity-mismatch"
  | "max-duration"
  | "max-positions"
  | "no-progress"
  | "single-snapshot";

export interface ConversationScanProgress {
  readonly step: number;
  readonly sourceScrollPosition: number;
  readonly mountedUserCount: number;
  readonly mountedAssistantCount: number;
  readonly accumulatedAssistantCount: number;
  readonly sourceDomChanged: boolean;
}

export interface ConversationScanOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ConversationScanProgress) => void;
}

export interface ConversationScanResult {
  readonly document: ConversationDocument | null;
  readonly scanPerformed: boolean;
  readonly completed: boolean;
  readonly terminationReason: ConversationScanTerminationReason;
}

export type RefreshConversation = (
  options?: ConversationScanOptions,
) => Promise<ConversationScanResult>;

export function assistantBlocks(document: ConversationDocument): DocumentContentBlock[] {
  return document.turns.flatMap((turn) => (turn.response ? [turn.response] : []));
}

export function toExtractedResponse(block: DocumentContentBlock): ExtractedResponse {
  return {
    id: block.id,
    source: block.provenance.platform,
    html: block.html,
    text: block.text,
    extractedAt: block.provenance.extractedAt,
  };
}

export interface AdapterCapabilities {
  configured: boolean;
  implemented: boolean;
  manuallyVerified: boolean;
  canExtractResponses: boolean;
}

export type AppearanceMode = "system" | "light" | "dark";
export type TextSize = "small" | "medium" | "large" | "x-large";
export type SpacingLevel = "compact" | "comfortable" | "roomy";
export type ReadingFont = "default" | "serif" | "dyslexia-friendly" | "fast-reading";
export type CodeAppearance = "color" | "plain";
export type DocumentOpenAt = "latest" | "beginning";

export interface ReaderPreferences {
  appearance: AppearanceMode;
  textSize: TextSize;
  spacing: SpacingLevel;
  readingFont: ReadingFont;
  codeAppearance: CodeAppearance;
  documentOpenAt: DocumentOpenAt;
}
