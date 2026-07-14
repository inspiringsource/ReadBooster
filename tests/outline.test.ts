import { describe, expect, it } from "vitest";

import { buildOutline, flattenOutline } from "../src/reader/outline";
import type { DocumentContentBlock } from "../src/shared/types";

function block(id: string, html: string): DocumentContentBlock {
  return {
    id,
    role: "assistant",
    html,
    text: "fixture",
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/test",
      extractedAt: "2026-07-14T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

describe("normalized content outline", () => {
  it("extracts semantic headings in document order across multiple blocks", () => {
    const outline = buildOutline([
      block("one", '<h2 id="one-a">Alpha</h2><p>Text</p><h3 id="one-b">Beta</h3>'),
      block("two", '<h2 id="two-a">Alpha</h2>'),
    ]);
    const flat = flattenOutline(outline);

    expect(flat.map((item) => item.text)).toEqual(["Alpha", "Beta", "Alpha"]);
    expect(flat.map((item) => item.targetBlockId)).toEqual(["one", "one", "two"]);
    expect(flat.map((item) => item.targetHeadingId)).toEqual(["one-a", "one-b", "two-a"]);
    expect(flat.map((item) => item.documentOrder)).toEqual([0, 1, 2]);
    expect(new Set(flat.map((item) => item.id)).size).toBe(3);
  });

  it("represents hierarchy and skipped heading levels without invented sections", () => {
    const outline = buildOutline([
      block(
        "levels",
        '<h2 id="a">A</h2><h4 id="b">B</h4><h6 id="c">C</h6><h3 id="d">D</h3><h2 id="e">E</h2>',
      ),
    ]);

    expect(outline.map((item) => item.text)).toEqual(["A", "E"]);
    expect(outline[0].children.map((item) => item.text)).toEqual(["B", "D"]);
    expect(outline[0].children[0].children.map((item) => item.text)).toEqual(["C"]);
    expect(flattenOutline(outline).map((item) => item.level)).toEqual([2, 4, 6, 3, 2]);
  });
});
