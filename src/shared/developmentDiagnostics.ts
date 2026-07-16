import type { ConversationScanTerminationReason } from "./types";

export interface ConversationPipelineDiagnostics {
  rawAssistantCandidates: number;
  rawUserCandidates: number;
  canonicalCandidates: number;
  deduplicatedCandidates: number;
  extractedAssistantBlocks: number;
  normalizedTurns: number;
  derivedDocumentSections: number;
  renderedDocumentSections: number;
  scanStep: number;
  sourceScrollPosition: number;
  mountedScanUserCount: number;
  mountedScanAssistantCount: number;
  accumulatedScanAssistantCount: number;
  sourceDomChanged: boolean;
  scanTerminationReason: ConversationScanTerminationReason | null;
}

const EMPTY_DIAGNOSTICS: ConversationPipelineDiagnostics = {
  rawAssistantCandidates: 0,
  rawUserCandidates: 0,
  canonicalCandidates: 0,
  deduplicatedCandidates: 0,
  extractedAssistantBlocks: 0,
  normalizedTurns: 0,
  derivedDocumentSections: 0,
  renderedDocumentSections: 0,
  scanStep: 0,
  sourceScrollPosition: 0,
  mountedScanUserCount: 0,
  mountedScanAssistantCount: 0,
  accumulatedScanAssistantCount: 0,
  sourceDomChanged: false,
  scanTerminationReason: null,
};

let diagnostics: ConversationPipelineDiagnostics = { ...EMPTY_DIAGNOSTICS };

/**
 * Keeps count-only extraction diagnostics in memory during development. It never records content,
 * identifiers, URLs, or timing data and is compiled to a no-op in production builds.
 */
export function resetConversationPipelineDiagnostics(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  diagnostics = { ...EMPTY_DIAGNOSTICS };
}

export function recordConversationPipelineDiagnostics(
  update: Partial<ConversationPipelineDiagnostics>,
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  diagnostics = { ...diagnostics, ...update };
}

export function getConversationPipelineDiagnostics(): Readonly<ConversationPipelineDiagnostics> {
  return { ...diagnostics };
}
