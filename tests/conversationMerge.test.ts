import { describe, expect, it } from "vitest";

import { conversationDocumentsMatch, mergeConversationDocuments } from "../src/shared/conversation";
import type {
  ConversationDocument,
  ConversationRole,
  DocumentContentBlock,
} from "../src/shared/types";

function block(
  role: ConversationRole,
  number: number,
  text = `${role} ${number}`,
  sourceMessageId = `${role}-${number}`,
): DocumentContentBlock {
  return {
    id: `${role}-block-${number}`,
    role,
    html: text ? `<p>${text}</p>` : "",
    text,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/merge-fixture",
      sourceConversationId: "merge-fixture",
      sourceMessageId,
      extractedAt: "2026-07-16T08:00:00.000Z",
      contentFingerprint: `fingerprint-${sourceMessageId}-${text}`,
    },
  };
}

function conversation(
  numbers: readonly number[],
  options: { assistantOnly?: ReadonlySet<number>; responseText?: (number: number) => string } = {},
): ConversationDocument {
  return {
    id: "chatgpt-merge-fixture",
    source: "chatgpt",
    title: "Merge fixture",
    sourceUrl: "https://chatgpt.com/c/merge-fixture",
    extractedAt: "2026-07-16T08:00:00.000Z",
    turns: numbers.map((number, index) => ({
      id: `fixture-turn-${number}`,
      index,
      prompt: options.assistantOnly?.has(number) ? null : block("user", number),
      response: block("assistant", number, options.responseText?.(number) ?? `assistant ${number}`),
    })),
  };
}

function responseNumbers(document: ConversationDocument): string[] {
  return document.turns.flatMap((turn) => (turn.response ? [turn.response.text] : []));
}

describe("mergeConversationDocuments", () => {
  it("grows responses 1–3 to 1–6 exactly once in chronological order", () => {
    const merged = mergeConversationDocuments(
      conversation([1, 2, 3]),
      conversation([1, 2, 3, 4, 5, 6]),
    );
    expect(responseNumbers(merged)).toEqual(
      Array.from({ length: 6 }, (_, index) => `assistant ${index + 1}`),
    );
    expect(merged.turns.map((turn) => turn.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("inserts newly discovered earlier turns using overlapping message anchors", () => {
    const merged = mergeConversationDocuments(
      conversation([4, 5, 6]),
      conversation([1, 2, 3, 4, 5, 6]),
    );
    expect(responseNumbers(merged)).toEqual(
      Array.from({ length: 6 }, (_, index) => `assistant ${index + 1}`),
    );
  });

  it("does not remove earlier turns when a later snapshot contains only responses 4–6", () => {
    const existing = conversation([1, 2, 3, 4, 5, 6]);
    const merged = mergeConversationDocuments(existing, conversation([4, 5, 6]));
    expect(merged).toBe(existing);
    expect(responseNumbers(merged)).toHaveLength(6);
  });

  it("appends response 7 and remains idempotent on repeated merges", () => {
    const existing = conversation([1, 2, 3, 4, 5, 6]);
    const incoming = conversation([4, 5, 6, 7]);
    const merged = mergeConversationDocuments(existing, incoming);
    expect(responseNumbers(merged).at(-1)).toBe("assistant 7");
    expect(responseNumbers(merged)).toHaveLength(7);
    expect(mergeConversationDocuments(merged, incoming)).toBe(merged);
  });

  it("retains distinct messages with generic test IDs and deduplicates stable source IDs", () => {
    const first = block("assistant", 1);
    const second = block("assistant", 2);
    const duplicateSecond = { ...second, id: "replacement-block-id" };
    const genericMarkup = '<p data-testid="conversation-turn-generic">Same markup</p>';
    const existing: ConversationDocument = {
      ...conversation([]),
      turns: [{ id: "one", index: 0, prompt: null, response: { ...first, html: genericMarkup } }],
    };
    const incoming: ConversationDocument = {
      ...conversation([]),
      turns: [
        { id: "two", index: 0, prompt: null, response: { ...second, html: genericMarkup } },
        { id: "duplicate-two", index: 1, prompt: null, response: duplicateSecond },
      ],
    };

    const merged = mergeConversationDocuments(existing, incoming);
    expect(responseNumbers(merged)).toEqual(["assistant 1", "assistant 2"]);
  });

  it("updates a matching streaming block only with richer completed content", () => {
    const existing = conversation([1], { responseText: () => "Partial response" });
    const completed = conversation([1], {
      responseText: () => "Partial response with the completed explanation",
    });
    const merged = mergeConversationDocuments(existing, completed);
    expect(merged.turns[0].response?.text).toBe("Partial response with the completed explanation");
    expect(merged.turns[0].response?.id).toBe(existing.turns[0].response?.id);
    expect(merged.turns[0].response?.provenance.contentFingerprint).toBe(
      completed.turns[0].response?.provenance.contentFingerprint,
    );

    const empty = conversation([1], { responseText: () => "" });
    const truncated = conversation([1], { responseText: () => "Partial" });
    expect(mergeConversationDocuments(merged, empty)).toBe(merged);
    expect(mergeConversationDocuments(merged, truncated)).toBe(merged);
  });

  it("ignores a malformed new block without changing valid neighboring turns", () => {
    const existing = conversation([1, 2]);
    const malformed = block("assistant", 99, "", "assistant-malformed");
    const incoming: ConversationDocument = {
      ...conversation([1, 2]),
      turns: [
        conversation([1]).turns[0],
        { id: "malformed", index: 1, prompt: null, response: malformed },
        { ...conversation([2]).turns[0], index: 2 },
      ],
    };
    expect(mergeConversationDocuments(existing, incoming)).toBe(existing);
    expect(responseNumbers(existing)).toEqual(["assistant 1", "assistant 2"]);
  });

  it("preserves assistant-only and prompt-only turns and leaves both inputs immutable", () => {
    const existing = conversation([2, 3], { assistantOnly: new Set([2]) });
    const promptOnly = block("user", 1);
    const incoming: ConversationDocument = {
      ...conversation([2, 3]),
      turns: [
        { id: "prompt-only", index: 0, prompt: promptOnly, response: null },
        ...conversation([2, 3]).turns,
      ],
    };
    const existingSnapshot = JSON.stringify(existing);
    const incomingSnapshot = JSON.stringify(incoming);
    const merged = mergeConversationDocuments(existing, incoming);

    expect(merged.turns[0]).toMatchObject({ prompt: promptOnly, response: null, index: 0 });
    expect(responseNumbers(merged)).toEqual(["assistant 2", "assistant 3"]);
    expect(JSON.stringify(existing)).toBe(existingSnapshot);
    expect(JSON.stringify(incoming)).toBe(incomingSnapshot);
  });

  it("rejects snapshots from a different reliable conversation identity", () => {
    const existing = conversation([1]);
    const incoming = {
      ...conversation([2]),
      id: "chatgpt-other",
      turns: conversation([2]).turns.map((turn) => ({
        ...turn,
        response: turn.response
          ? {
              ...turn.response,
              provenance: {
                ...turn.response.provenance,
                sourceConversationId: "other",
              },
            }
          : null,
      })),
    };
    expect(conversationDocumentsMatch(existing, incoming)).toBe(false);
    expect(mergeConversationDocuments(existing, incoming)).toBe(existing);
  });
});
