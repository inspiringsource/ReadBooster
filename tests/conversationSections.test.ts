import { describe, expect, it } from "vitest";

import {
  conciseTitle,
  deriveConversationOutline,
  deriveConversationSections,
} from "../src/reader/presentation";
import type {
  ConversationDocument,
  ConversationTurn,
  DocumentContentBlock,
} from "../src/shared/types";

function block(
  id: string,
  role: "user" | "assistant",
  html: string,
  text: string,
): DocumentContentBlock {
  return {
    id,
    role,
    html,
    text,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/sections",
      extractedAt: "2026-07-15T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(turns: ConversationTurn[]): ConversationDocument {
  return {
    id: "sections",
    source: "chatgpt",
    title: "Section fixture",
    sourceUrl: "https://chatgpt.com/c/sections",
    extractedAt: "2026-07-15T00:00:00.000Z",
    turns,
  };
}

describe("continuous document sections", () => {
  it("preserves chronological eligible turns and excludes incomplete response-less turns", () => {
    const prompt = block("prompt", "user", "<p>Prompt title</p>", "Prompt title");
    const first = block(
      "first",
      "assistant",
      '<h2 id="first-heading">Heading title</h2>',
      "Heading title",
    );
    const second = block("second", "assistant", "<p>Body only</p>", "Body only");
    const sections = deriveConversationSections(
      conversation([
        { id: "turn-a", index: 0, prompt, response: first },
        { id: "turn-incomplete", index: 1, prompt, response: null },
        { id: "turn-b", index: 2, prompt: null, response: second },
      ]),
    );

    expect(sections.map((section) => section.responseBlockId)).toEqual(["first", "second"]);
    expect(sections[0].prompt).toBe(prompt);
    expect(sections[1].prompt).toBeNull();
    expect(sections.map((section) => section.index)).toEqual([0, 1]);
    expect(sections[0].id).toContain("turn-a-first");
    expect(
      deriveConversationSections(
        conversation([{ id: "turn-a", index: 0, prompt, response: first }]),
      )[0].id,
    ).toBe(sections[0].id);
  });

  it("uses heading, shortened prompt, and numbered title fallbacks deterministically", () => {
    const longPrompt =
      "This is a deliberately long user prompt that should be shortened at a sensible word boundary while staying deterministic for navigation";
    const sections = deriveConversationSections(
      conversation([
        {
          id: "heading-turn",
          index: 0,
          prompt: null,
          response: block(
            "heading-response",
            "assistant",
            '<h2 id="meaningful">  Meaningful   heading </h2>',
            "Meaningful heading",
          ),
        },
        {
          id: "prompt-turn",
          index: 1,
          prompt: block("long-prompt", "user", `<p>${longPrompt}</p>`, longPrompt),
          response: block("prompt-response", "assistant", "<p>Answer</p>", "Answer"),
        },
        {
          id: "fallback-turn",
          index: 2,
          prompt: null,
          response: block("fallback-response", "assistant", "<p>Answer</p>", "Answer"),
        },
      ]),
    );

    expect(sections.map((section) => section.titleSource)).toEqual([
      "heading",
      "prompt",
      "fallback",
    ]);
    expect(sections[0].title).toBe("Meaningful heading");
    expect(sections[1].title.length).toBeLessThanOrEqual(80);
    expect(sections[1].title.endsWith("…")).toBe(true);
    expect(sections[2].title).toBe("Response 3");
    expect(conciseTitle(longPrompt)).toBe(conciseTitle(longPrompt));
  });

  it("attaches response-local outlines and deduplicates only a heading-derived group title", () => {
    const first = block(
      "first-response",
      "assistant",
      '<h2 id="first-title">Same title</h2><h3 id="first-child">Child one</h3>',
      "Same title Child one",
    );
    const second = block(
      "second-response",
      "assistant",
      '<h3 id="second-title">Same title</h3><h4 id="second-child">Child two</h4>',
      "Same title Child two",
    );
    const sections = deriveConversationSections(
      conversation([
        { id: "turn-one", index: 0, prompt: null, response: first },
        { id: "turn-two", index: 1, prompt: null, response: second },
      ]),
    );
    const groups = deriveConversationOutline(sections);

    expect(sections[0].outline[0].targetBlockId).toBe("first-response");
    expect(sections[1].outline[0].targetBlockId).toBe("second-response");
    expect(sections[0].outline[0].targetHeadingId).not.toBe(sections[1].outline[0].targetHeadingId);
    expect(groups).toHaveLength(2);
    expect(groups[0].children.map((item) => item.text)).toEqual(["Child one"]);
    expect(groups[1].children.map((item) => item.text)).toEqual(["Child two"]);
  });
});
