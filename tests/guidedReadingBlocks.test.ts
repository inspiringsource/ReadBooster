import { describe, expect, it, vi } from "vitest";

import {
  applyReadingBlockMetadata,
  discoverReadingBlocks,
  nearestReadingBlock,
  setReadingBlockStates,
} from "../src/reader/guidedReading/readingBlocks";

function fixture(): HTMLElement {
  const root = document.createElement("main");
  root.innerHTML = `
    <section data-rb-section-id="section-one">
      <article class="rb-content rb-content--document" data-rb-response-id="response-one">
        <h2>Heading</h2>
        <p>First paragraph.</p>
        <p>   </p>
        <ul><li>One</li><li><p>Nested paragraph stays in the list.</p></li></ul>
        <blockquote><p>Quoted paragraph stays in the quote.</p></blockquote>
        <div class="rb-table-block"><div class="rb-table-toolbar"><button>Fit</button></div><table><tr><td>Cell</td></tr></table></div>
        <div class="rb-code-block"><div class="rb-code-toolbar"><button>Copy</button></div><pre><code>const ready = true;</code></pre></div>
        <figure><img src="figure.png" alt="Diagram"><figcaption>A diagram</figcaption></figure>
        <p><img src="standalone.png" alt="Standalone diagram"></p>
        <section data-readbooster-content-block="document"><header class="rb-document-block__header"><button>Copy document</button></header><div><h3>Document heading</h3><p>Document body.</p></div></section>
      </article>
    </section>`;
  return root;
}

describe("Guided Reading block model", () => {
  it("discovers stable, meaningful units without nested duplicates or controls", () => {
    const root = fixture();
    const first = discoverReadingBlocks(root);
    const second = discoverReadingBlocks(root);

    expect(first.map((entry) => entry.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "quote",
      "table",
      "code",
      "image",
      "image",
      "document",
    ]);
    expect(first.map((entry) => entry.id)).toEqual(second.map((entry) => entry.id));
    expect(first.every((entry) => entry.sectionId === "section-one")).toBe(true);
    expect(first.some((entry) => entry.element.matches("button, .rb-block-toolbar"))).toBe(false);
  });

  it("adds reversible metadata and keeps only one active block", () => {
    const entries = discoverReadingBlocks(fixture());
    const cleanup = applyReadingBlockMetadata(entries);
    setReadingBlockStates(entries, entries[2].id);

    expect(
      entries.filter((entry) => entry.element.dataset.rbGuidedState === "active"),
    ).toHaveLength(1);
    expect(entries[1].element.dataset.rbGuidedState).toBe("nearby");
    expect(entries[0].element.dataset.rbGuidedState).toBe("distant");
    cleanup();
    expect(entries.every((entry) => !entry.element.hasAttribute("data-rb-reading-block-id"))).toBe(
      true,
    );
  });

  it("uses a central focus zone with hysteresis at block boundaries", () => {
    const root = fixture();
    const entries = discoverReadingBlocks(root).slice(0, 3);
    const scrollArea = root as HTMLElement;
    vi.spyOn(scrollArea, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1000,
      height: 1000,
      left: 0,
      right: 800,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const rects = [
      { top: 0, bottom: 100 },
      { top: 390, bottom: 470 },
      { top: 510, bottom: 620 },
    ];
    entries.forEach((entry, index) =>
      vi.spyOn(entry.element, "getBoundingClientRect").mockReturnValue({
        ...rects[index],
        height: rects[index].bottom - rects[index].top,
        left: 0,
        right: 700,
        width: 700,
        x: 0,
        y: rects[index].top,
        toJSON: () => ({}),
      }),
    );

    expect(nearestReadingBlock(entries, scrollArea, entries[0].id)?.id).toBe(entries[1].id);
    expect(nearestReadingBlock(entries, scrollArea, entries[1].id)?.id).toBe(entries[1].id);
  });
});
