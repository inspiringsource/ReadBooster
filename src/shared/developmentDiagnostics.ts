export interface ConversationPipelineDiagnostics {
  rawAssistantCandidates: number;
  rawUserCandidates: number;
  canonicalCandidates: number;
  deduplicatedCandidates: number;
  extractedAssistantBlocks: number;
  normalizedTurns: number;
  derivedDocumentSections: number;
  renderedDocumentSections: number;
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
