import { conversationDocumentsMatch, mergeConversationDocuments } from "../shared/conversation";
import type {
  ConversationDocument,
  ConversationScanOptions,
  ConversationScanProgress,
  ConversationScanResult,
  ConversationScanTerminationReason,
} from "../shared/types";
import { assistantBlocks } from "../shared/types";

export interface ConversationScanSettledState {
  readonly domChanged: boolean;
}

export interface ConversationScanSource {
  getScrollPosition(): number;
  getScrollHeight(): number;
  getViewportHeight(): number;
  scrollTo(position: number): void;
  settle(signal?: AbortSignal): Promise<ConversationScanSettledState>;
  restore(position: number): Promise<void>;
}

export interface ConversationSourceScanLimits {
  readonly maximumDurationMs: number;
  readonly maximumPositions: number;
  readonly noProgressLimit: number;
  readonly stepRatio: number;
  readonly topStabilizationLimit: number;
}

export const DEFAULT_CONVERSATION_SCAN_LIMITS: ConversationSourceScanLimits = {
  maximumDurationMs: 12_000,
  maximumPositions: 40,
  noProgressLimit: 3,
  stepRatio: 0.75,
  topStabilizationLimit: 3,
};

export interface ScanConversationSourceOptions extends ConversationScanOptions {
  readonly initialDocument: ConversationDocument;
  readonly source: ConversationScanSource;
  readonly captureSnapshot: () => ConversationDocument | null;
  readonly limits?: Partial<ConversationSourceScanLimits>;
  readonly now?: () => number;
}

function userCount(document: ConversationDocument): number {
  return document.turns.reduce((count, turn) => count + (turn.prompt ? 1 : 0), 0);
}

function abortedResult(document: ConversationDocument): ConversationScanResult {
  return {
    document,
    scanPerformed: true,
    completed: false,
    terminationReason: "aborted",
  };
}

/**
 * Traverses a virtualized conversation source in bounded viewport-sized steps. Every settled DOM
 * window is normalized by the caller and merged immediately so later unmounting cannot discard it.
 */
export async function scanConversationSource({
  initialDocument,
  source,
  captureSnapshot,
  signal,
  onProgress,
  limits: limitOverrides,
  now = () => performance.now(),
}: ScanConversationSourceOptions): Promise<ConversationScanResult> {
  const limits = { ...DEFAULT_CONVERSATION_SCAN_LIMITS, ...limitOverrides };
  const originalPosition = source.getScrollPosition();
  const startedAt = now();
  let accumulated = initialDocument;
  let terminationReason: ConversationScanTerminationReason = "failed";
  let completed = false;
  let step = 0;
  let targetPosition = 0;
  let previousPosition = Number.NaN;
  let previousHeight = Number.NaN;
  let noProgressCount = 0;
  let topStabilizationCount = 0;

  try {
    while (step < limits.maximumPositions) {
      if (signal?.aborted) {
        return abortedResult(accumulated);
      }
      if (now() - startedAt >= limits.maximumDurationMs) {
        terminationReason = "max-duration";
        break;
      }

      source.scrollTo(targetPosition);
      let settled: ConversationScanSettledState;
      try {
        settled = await source.settle(signal);
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return abortedResult(accumulated);
        }
        terminationReason = "failed";
        break;
      }
      if (signal?.aborted) {
        return abortedResult(accumulated);
      }

      let snapshot: ConversationDocument | null;
      try {
        snapshot = captureSnapshot();
      } catch {
        terminationReason = "failed";
        break;
      }
      if (snapshot) {
        if (!conversationDocumentsMatch(accumulated, snapshot)) {
          terminationReason = "identity-mismatch";
          break;
        }
        accumulated = mergeConversationDocuments(accumulated, snapshot);
      }

      step += 1;
      const position = Math.max(0, source.getScrollPosition());
      const scrollHeight = Math.max(0, source.getScrollHeight());
      const viewportHeight = Math.max(1, source.getViewportHeight());
      const progress: ConversationScanProgress = {
        step,
        sourceScrollPosition: Math.round(position),
        mountedUserCount: snapshot ? userCount(snapshot) : 0,
        mountedAssistantCount: snapshot ? assistantBlocks(snapshot).length : 0,
        accumulatedAssistantCount: assistantBlocks(accumulated).length,
        sourceDomChanged: settled.domChanged,
      };
      onProgress?.(progress);

      const bottomPosition = Math.max(0, scrollHeight - viewportHeight);
      if (position >= bottomPosition - 2) {
        terminationReason = "bottom";
        completed = true;
        break;
      }

      const positionAdvanced = Number.isNaN(previousPosition) || position > previousPosition + 1;
      const heightChanged = Number.isNaN(previousHeight) || scrollHeight !== previousHeight;
      if (!positionAdvanced && !heightChanged && !settled.domChanged) {
        noProgressCount += 1;
      } else {
        noProgressCount = 0;
      }
      if (noProgressCount >= limits.noProgressLimit) {
        terminationReason = "no-progress";
        break;
      }

      const topStillChanging =
        targetPosition === 0 &&
        topStabilizationCount < limits.topStabilizationLimit &&
        (position > 1 || settled.domChanged || heightChanged);
      if (topStillChanging) {
        topStabilizationCount += 1;
        targetPosition = 0;
      } else {
        const stepSize = Math.max(1, Math.floor(viewportHeight * limits.stepRatio));
        targetPosition = Math.min(
          bottomPosition,
          Math.max(position + stepSize, targetPosition + 1),
        );
      }
      previousPosition = position;
      previousHeight = scrollHeight;
    }

    if (step >= limits.maximumPositions && terminationReason === "failed") {
      terminationReason = "max-positions";
    }

    return {
      document: accumulated,
      scanPerformed: true,
      completed,
      terminationReason,
    };
  } finally {
    try {
      await source.restore(originalPosition);
    } catch {
      // Restoration is best-effort, but it is always attempted from this shared cleanup path.
    }
  }
}
