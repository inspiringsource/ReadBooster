import { describe, expect, it, vi } from "vitest";

import {
  scanConversationSource,
  type ConversationScanSource,
} from "../src/content/conversationSourceScanner";
import { mergeConversationDocuments } from "../src/shared/conversation";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";
import { assistantBlocks } from "../src/shared/types";

function response(number: number): DocumentContentBlock {
  return {
    id: `response-${number}`,
    role: "assistant",
    html: `<h2>Response ${number}</h2><p>Body ${number}</p>`,
    text: `Response ${number} Body ${number}`,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/virtualized-fixture",
      sourceConversationId: "virtualized-fixture",
      sourceMessageId: `response-${number}`,
      extractedAt: "2026-07-16T12:00:00.000Z",
      contentFingerprint: `fingerprint-response-${number}`,
    },
  };
}

function conversation(
  numbers: readonly number[],
  id = "chatgpt-virtualized-fixture",
): ConversationDocument {
  return {
    id,
    source: "chatgpt",
    title: "Virtualized fixture",
    sourceUrl: "https://chatgpt.com/c/virtualized-fixture",
    extractedAt: "2026-07-16T12:00:00.000Z",
    turns: numbers.map((number, index) => ({
      id: `turn-missing-prompt-response-${number}`,
      index,
      prompt: null,
      response: response(number),
    })),
  };
}

function responseNumbers(document: ConversationDocument | null): number[] {
  return document
    ? assistantBlocks(document).map((block) => Number(block.id.replace("response-", "")))
    : [];
}

class VirtualizedSource implements ConversationScanSource {
  position: number;
  height = 3_000;
  viewport = 1_000;
  readonly restored: number[] = [];
  readonly visited: number[] = [];

  constructor(position: number) {
    this.position = position;
  }

  getScrollPosition(): number {
    return this.position;
  }

  getScrollHeight(): number {
    return this.height;
  }

  getViewportHeight(): number {
    return this.viewport;
  }

  scrollTo(position: number): void {
    this.position = Math.min(Math.max(0, position), this.height - this.viewport);
    this.visited.push(this.position);
  }

  settle(): Promise<{ domChanged: boolean }> {
    return Promise.resolve({ domChanged: false });
  }

  restore(position: number): Promise<void> {
    this.position = position;
    this.restored.push(position);
    return Promise.resolve();
  }

  mountedDocument(): ConversationDocument {
    if (this.position < 600) {
      return conversation([1, 2, 3]);
    }
    if (this.position < 1_500) {
      return conversation([2, 3, 4]);
    }
    return conversation([3, 4, 5]);
  }
}

describe("bounded virtualized conversation scanning", () => {
  async function scanFrom(start: number, initial: readonly number[]) {
    const source = new VirtualizedSource(start);
    const result = await scanConversationSource({
      initialDocument: conversation(initial),
      source,
      captureSnapshot: () => source.mountedDocument(),
    });
    return { result, source };
  }

  it.each([
    ["bottom", 2_000, [3, 4, 5]],
    ["top", 0, [1, 2, 3]],
  ])(
    "discovers the same five responses when opening from the %s",
    async (_label, start, initial) => {
      const { result, source } = await scanFrom(start as number, initial as number[]);

      expect(result.completed).toBe(true);
      expect(result.terminationReason).toBe("bottom");
      expect(responseNumbers(result.document)).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(responseNumbers(result.document)).size).toBe(5);
      expect(source.restored).toEqual([start]);
      expect(source.position).toBe(start);
    },
  );

  it("produces identical chronological identities from top and bottom starts", async () => {
    const top = await scanFrom(0, [1, 2, 3]);
    const bottom = await scanFrom(2_000, [3, 4, 5]);

    expect(bottom.result.document?.turns.map((turn) => turn.response?.id)).toEqual(
      top.result.document?.turns.map((turn) => turn.response?.id),
    );
    expect(bottom.result.document?.turns.map((turn) => turn.response?.html)).toEqual(
      top.result.document?.turns.map((turn) => turn.response?.html),
    );
  });

  it("progressively retains earlier discoveries when a later window contains only three", async () => {
    const source = new VirtualizedSource(2_000);
    const progress: number[] = [];
    const snapshots = [
      conversation([2, 3, 4, 5]),
      conversation([1, 2, 3]),
      conversation([2, 3, 4]),
      conversation([3, 4, 5]),
    ];
    let snapshotIndex = 0;
    const result = await scanConversationSource({
      initialDocument: conversation([3, 4, 5]),
      source,
      captureSnapshot: () => snapshots[Math.min(snapshotIndex++, snapshots.length - 1)],
      onProgress: (state) => progress.push(state.accumulatedAssistantCount),
    });

    expect(progress).toContain(4);
    expect(progress.at(-1)).toBe(5);
    expect(responseNumbers(result.document)).toEqual([1, 2, 3, 4, 5]);
    expect(
      responseNumbers(mergeConversationDocuments(result.document!, conversation([3, 4, 5]))),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("restores the original position after a snapshot failure", async () => {
    const source = new VirtualizedSource(1_250);
    const result = await scanConversationSource({
      initialDocument: conversation([2, 3, 4]),
      source,
      captureSnapshot: () => {
        throw new Error("stale DOM");
      },
    });

    expect(result.terminationReason).toBe("failed");
    expect(result.completed).toBe(false);
    expect(source.restored).toEqual([1_250]);
  });

  it("restores after cancellation and does not capture a late window", async () => {
    const source = new VirtualizedSource(1_500);
    const controller = new AbortController();
    source.settle = vi.fn(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    const capture = vi.fn(() => source.mountedDocument());

    const result = await scanConversationSource({
      initialDocument: conversation([3, 4, 5]),
      source,
      captureSnapshot: capture,
      signal: controller.signal,
    });

    expect(result.terminationReason).toBe("aborted");
    expect(capture).not.toHaveBeenCalled();
    expect(source.restored).toEqual([1_500]);
  });

  it("re-evaluates a scroll height that grows while the top window settles", async () => {
    const source = new VirtualizedSource(1_000);
    source.height = 2_000;
    let settled = 0;
    source.settle = vi.fn(async () => {
      settled += 1;
      if (settled === 1) {
        source.height = 3_000;
      }
      return { domChanged: settled === 1 };
    });

    const result = await scanConversationSource({
      initialDocument: conversation([2, 3, 4]),
      source,
      captureSnapshot: () => source.mountedDocument(),
    });

    expect(result.terminationReason).toBe("bottom");
    expect(source.visited).toContain(2_000);
    expect(responseNumbers(result.document)).toEqual([1, 2, 3, 4, 5]);
  });

  it("terminates when the source repeatedly makes no progress", async () => {
    const source = new VirtualizedSource(300);
    source.scrollTo = vi.fn();
    const result = await scanConversationSource({
      initialDocument: conversation([2, 3, 4]),
      source,
      captureSnapshot: () => conversation([2, 3, 4]),
      limits: { noProgressLimit: 2 },
    });

    expect(result.completed).toBe(false);
    expect(result.terminationReason).toBe("no-progress");
    expect(source.restored).toEqual([300]);
  });

  it("honors maximum-position and maximum-duration bounds", async () => {
    const positionsSource = new VirtualizedSource(800);
    positionsSource.height = 20_000;
    const positions = await scanConversationSource({
      initialDocument: conversation([2, 3, 4]),
      source: positionsSource,
      captureSnapshot: () => conversation([2, 3, 4]),
      limits: { maximumPositions: 2, topStabilizationLimit: 0 },
    });
    expect(positions.terminationReason).toBe("max-positions");

    const durationSource = new VirtualizedSource(800);
    const timestamps = [0, 20];
    const duration = await scanConversationSource({
      initialDocument: conversation([2, 3, 4]),
      source: durationSource,
      captureSnapshot: () => conversation([2, 3, 4]),
      limits: { maximumDurationMs: 10 },
      now: () => timestamps.shift() ?? 20,
    });
    expect(duration.terminationReason).toBe("max-duration");
    expect(durationSource.restored).toEqual([800]);
  });

  it("rejects a different conversation identity without merging it", async () => {
    const source = new VirtualizedSource(1_000);
    const result = await scanConversationSource({
      initialDocument: conversation([2, 3, 4]),
      source,
      captureSnapshot: () => {
        const other = conversation([1], "chatgpt-other");
        return {
          ...other,
          sourceUrl: "https://chatgpt.com/c/other",
          turns: other.turns.map((turn) => ({
            ...turn,
            response: turn.response
              ? {
                  ...turn.response,
                  provenance: {
                    ...turn.response.provenance,
                    sourceUrl: "https://chatgpt.com/c/other",
                    sourceConversationId: "other",
                  },
                }
              : null,
          })),
        };
      },
    });

    expect(result.terminationReason).toBe("identity-mismatch");
    expect(responseNumbers(result.document)).toEqual([2, 3, 4]);
  });
});
