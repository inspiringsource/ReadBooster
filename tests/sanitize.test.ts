import { describe, expect, it } from "vitest";

import { sanitizeResponseHtml, serializeSemanticText } from "../src/content/sanitize";

function fixture(html: string): HTMLDivElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("semantic plain text", () => {
  it("preserves headings and adjacent paragraph boundaries", () => {
    expect(
      serializeSemanticText(
        fixture("<h2>Heading</h2><p>First paragraph.</p><p>Second paragraph.</p>"),
      ),
    ).toBe("Heading\n\nFirst paragraph.\n\nSecond paragraph.");
  });

  it("preserves list, blockquote, table, inline-code, and code-block structure", () => {
    const text = serializeSemanticText(
      fixture(`
        <p>Use <code>npm test</code> now.</p>
        <ul><li>Alpha</li><li>Beta</li></ul>
        <blockquote><p>Quoted text</p></blockquote>
        <table><tr><th>Name</th><th>Value</th></tr><tr><td>One</td><td>Two</td></tr></table>
        <pre><code>const first = 1;\n\nconst second = 2;</code></pre>
      `),
    );

    expect(text).toBe(
      [
        "Use npm test now.",
        "- Alpha\n- Beta",
        "> Quoted text",
        "Name\tValue\nOne\tTwo",
        "const first = 1;\n\nconst second = 2;",
      ].join("\n\n"),
    );
  });
});

describe("response sanitization", () => {
  it("removes dangerous links, event handlers, styles, and data attributes", () => {
    const { html } = sanitizeResponseHtml(
      fixture(`
        <p lang="de" dir="ltr" style="color:red" data-secret="x" onclick="alert(1)">
          <a href="javascript:alert(1)" onmouseover="alert(2)">Unsafe link</a>
        </p>
        <img src=x onerror="alert(3)">
      `),
    );

    expect(html).toContain('lang="de"');
    expect(html).toContain('dir="ltr"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onmouseover");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("data-secret");
    expect(html).not.toContain("<img");
  });

  it("preserves safe table/list semantics and handles malformed HTML", () => {
    const { html, text } = sanitizeResponseHtml(
      fixture(`
        <ol start="3"><li value="5">Five<li>Six</ol>
        <table><tr><th id="name" scope="col" colspan="2">Name</th></tr><tr><td headers="name" rowspan="2">A</td><td>B</td></tr></table>
        <p><strong>Unclosed
      `),
    );

    expect(html).toContain('start="3"');
    expect(html).toContain('value="5"');
    expect(html).toContain('scope="col"');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="2"');
    const sanitized = fixture(html);
    const headerId = sanitized.querySelector("th")?.id;
    expect(headerId).toMatch(/^rb-content-/);
    expect(sanitized.querySelector("td")?.getAttribute("headers")).toBe(headerId);
    expect(text).toContain("5. Five\n6. Six");
    expect(text).toContain("Unclosed");
  });
});
