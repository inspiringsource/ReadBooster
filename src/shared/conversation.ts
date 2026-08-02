import type { ConversationDocument, ConversationTurn, DocumentContentBlock } from "./types";

interface SequencedBlock {
  block: DocumentContentBlock;
  identity: string | null;
}

function stableBlockIdentity(block: DocumentContentBlock): string | null {
  const sourceMessageId = block.provenance.sourceMessageId?.trim();
  if (sourceMessageId) {
    return `source:${block.provenance.platform}:${block.role}:${sourceMessageId}`;
  }

  const blockId = block.id.trim();
  return blockId ? `block:${block.provenance.platform}:${block.role}:${blockId}` : null;
}

function stableTurnId(
  prompt: DocumentContentBlock | null,
  response: DocumentContentBlock | null,
): string {
  return `turn-${prompt?.id ?? "missing-prompt"}-${response?.id ?? "missing-response"}`;
}

/** Pairs an ordered normalized block stream without using array position as message identity. */
export function pairContentBlocksIntoTurns(
  blocks: readonly DocumentContentBlock[],
): ConversationTurn[] {
  const paired: Array<{
    prompt: DocumentContentBlock | null;
    response: DocumentContentBlock | null;
  }> = [];
  let current: {
    prompt: DocumentContentBlock | null;
    response: DocumentContentBlock | null;
  } | null = null;

  for (const block of blocks) {
    if (block.role === "user") {
      if (current && (current.prompt || current.response)) {
        paired.push(current);
      }
      current = { prompt: block, response: null };
      continue;
    }

    if (!current) {
      current = { prompt: null, response: null };
    } else if (current.response) {
      paired.push(current);
      current = { prompt: null, response: null };
    }
    current.response = block;
  }

  if (current && (current.prompt || current.response)) {
    paired.push(current);
  }

  return paired.map((turn, index) => ({
    id: stableTurnId(turn.prompt, turn.response),
    index,
    prompt: turn.prompt,
    response: turn.response,
  }));
}

function sourceConversationIdentity(document: ConversationDocument): string | null | undefined {
  const sourceConversationIds = new Set(
    document.turns
      .flatMap((turn) => [turn.prompt, turn.response])
      .flatMap((block) => block?.provenance.sourceConversationId?.trim() || []),
  );
  if (sourceConversationIds.size > 1) {
    return null;
  }
  if (sourceConversationIds.size === 1) {
    return sourceConversationIds.values().next().value;
  }
  return undefined;
}

export function conversationDocumentsMatch(
  existing: ConversationDocument,
  incoming: ConversationDocument,
): boolean {
  if (existing.source !== incoming.source) {
    return false;
  }

  const existingSourceIdentity = sourceConversationIdentity(existing);
  const incomingSourceIdentity = sourceConversationIdentity(incoming);
  if (existingSourceIdentity === null || incomingSourceIdentity === null) {
    return false;
  }
  if (existingSourceIdentity !== undefined || incomingSourceIdentity !== undefined) {
    return (
      existingSourceIdentity !== undefined &&
      incomingSourceIdentity !== undefined &&
      existingSourceIdentity === incomingSourceIdentity
    );
  }

  const existingDocumentId = existing.id.trim();
  const incomingDocumentId = incoming.id.trim();
  if (existingDocumentId && incomingDocumentId) {
    return existingDocumentId === incomingDocumentId;
  }

  try {
    const existingUrl = new URL(existing.sourceUrl);
    const incomingUrl = new URL(incoming.sourceUrl);
    return (
      existingUrl.origin === incomingUrl.origin && existingUrl.pathname === incomingUrl.pathname
    );
  } catch {
    return false;
  }
}

function normalizedText(block: DocumentContentBlock): string {
  return block.text.replace(/\s+/g, " ").trim();
}

function mediaCount(block: DocumentContentBlock): number {
  return block.html.match(/<(?:figure|img)\b/gi)?.length ?? 0;
}

function hasMeaningfulContent(block: DocumentContentBlock): boolean {
  return Boolean(normalizedText(block)) || mediaCount(block) > 0;
}

function preferCompletedBlock(
  existing: DocumentContentBlock,
  incoming: DocumentContentBlock,
): DocumentContentBlock {
  if (existing.provenance.contentFingerprint === incoming.provenance.contentFingerprint) {
    return existing;
  }

  const existingText = normalizedText(existing);
  const incomingText = normalizedText(incoming);
  const existingMedia = mediaCount(existing);
  const incomingMedia = mediaCount(incoming);
  const incomingHasContent = hasMeaningfulContent(incoming);
  if (
    incoming.provenance.platform === "github-discussion" &&
    incomingHasContent &&
    incoming.provenance.sourceMessageId === existing.provenance.sourceMessageId
  ) {
    return { ...incoming, id: existing.id };
  }
  if (
    !incomingHasContent ||
    incomingText.length < existingText.length ||
    incomingMedia < existingMedia
  ) {
    return existing;
  }

  const hasMoreText = incomingText.length > existingText.length;
  const hasMoreSemanticHtml =
    incomingText === existingText && incoming.html.length > existing.html.length;
  if (!hasMoreText && !hasMoreSemanticHtml) {
    return existing;
  }

  // Keep the stable reader identity while accepting the newer original-source extraction.
  return { ...incoming, id: existing.id };
}

function orderedBlocks(document: ConversationDocument): DocumentContentBlock[] {
  return document.turns.flatMap((turn) => [
    ...(turn.prompt ? [turn.prompt] : []),
    ...(turn.response ? [turn.response] : []),
  ]);
}

function deduplicateStableBlocks(blocks: readonly DocumentContentBlock[]): SequencedBlock[] {
  const result: SequencedBlock[] = [];
  const positions = new Map<string, number>();

  for (const block of blocks) {
    const identity = stableBlockIdentity(block);
    if (!identity) {
      result.push({ block, identity: null });
      continue;
    }
    const existingPosition = positions.get(identity);
    if (existingPosition === undefined) {
      positions.set(identity, result.length);
      result.push({ block, identity });
      continue;
    }
    result[existingPosition] = {
      identity,
      block: preferCompletedBlock(result[existingPosition].block, block),
    };
  }

  return result;
}

function longestCommonIdentityPairs(
  existing: readonly SequencedBlock[],
  incoming: readonly SequencedBlock[],
): Array<readonly [number, number]> {
  const lengths = Array.from({ length: existing.length + 1 }, () =>
    Array<number>(incoming.length + 1).fill(0),
  );
  for (let left = existing.length - 1; left >= 0; left -= 1) {
    for (let right = incoming.length - 1; right >= 0; right -= 1) {
      const matches =
        existing[left].identity !== null && existing[left].identity === incoming[right].identity;
      lengths[left][right] = matches
        ? lengths[left + 1][right + 1] + 1
        : Math.max(lengths[left + 1][right], lengths[left][right + 1]);
    }
  }

  const pairs: Array<readonly [number, number]> = [];
  let left = 0;
  let right = 0;
  while (left < existing.length && right < incoming.length) {
    if (existing[left].identity && existing[left].identity === incoming[right].identity) {
      pairs.push([left, right]);
      left += 1;
      right += 1;
    } else if (lengths[left + 1][right] >= lengths[left][right + 1]) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return pairs;
}

function mergeBlockSequences(
  existing: readonly SequencedBlock[],
  incoming: readonly SequencedBlock[],
): DocumentContentBlock[] {
  const pairs = longestCommonIdentityPairs(existing, incoming);
  const result: DocumentContentBlock[] = [];
  const resultPositions = new Map<string, number>();

  const append = (entry: SequencedBlock): void => {
    if (!entry.identity) {
      result.push(entry.block);
      return;
    }
    const existingPosition = resultPositions.get(entry.identity);
    if (existingPosition === undefined) {
      resultPositions.set(entry.identity, result.length);
      result.push(entry.block);
      return;
    }
    result[existingPosition] = preferCompletedBlock(result[existingPosition], entry.block);
  };

  let existingCursor = 0;
  let incomingCursor = 0;
  for (const [existingAnchor, incomingAnchor] of pairs) {
    existing.slice(existingCursor, existingAnchor).forEach(append);
    incoming.slice(incomingCursor, incomingAnchor).forEach(append);
    append({
      identity: existing[existingAnchor].identity,
      block: preferCompletedBlock(existing[existingAnchor].block, incoming[incomingAnchor].block),
    });
    existingCursor = existingAnchor + 1;
    incomingCursor = incomingAnchor + 1;
  }
  existing.slice(existingCursor).forEach(append);
  incoming.slice(incomingCursor).forEach(append);
  return result;
}

/**
 * Accumulates two snapshots without deleting blocks absent from the newer live-DOM snapshot.
 * Overlapping stable message identities anchor ordering. With no overlap, existing content is kept
 * first and the disjoint incoming snapshot is appended rather than guessing chronology.
 */
export function mergeConversationDocuments(
  existing: ConversationDocument,
  incoming: ConversationDocument,
): ConversationDocument {
  if (!conversationDocumentsMatch(existing, incoming)) {
    return existing;
  }

  const existingBlocks = deduplicateStableBlocks(orderedBlocks(existing));
  const incomingBlocks = deduplicateStableBlocks(
    orderedBlocks(incoming).filter(hasMeaningfulContent),
  );
  const mergedBlocks = mergeBlockSequences(existingBlocks, incomingBlocks);
  const existingOrderedBlocks = orderedBlocks(existing);
  const blocksChanged =
    mergedBlocks.length !== existingOrderedBlocks.length ||
    mergedBlocks.some((block, index) => block !== existingOrderedBlocks[index]);
  const titleChanged = !existing.title && Boolean(incoming.title);
  const sourceContextChanged =
    JSON.stringify(existing.sourceContext ?? null) !==
    JSON.stringify(incoming.sourceContext ?? null);
  if (!blocksChanged && !titleChanged && !sourceContextChanged) {
    return existing;
  }

  return {
    ...existing,
    title: existing.title ?? incoming.title,
    extractedAt: incoming.extractedAt,
    sourceContext: incoming.sourceContext ?? existing.sourceContext,
    turns: pairContentBlocksIntoTurns(mergedBlocks),
  };
}
