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
  it("retains safe semantic media and includes alternatives and captions in copy text", () => {
    const { html, text } = sanitizeResponseHtml(
      fixture(`
        <figure id="chart">
          <img src="data:image/png;base64,AAAA" alt="Campaign timeline" width="800" height="400" onclick="bad()">
          <figcaption>Campaign reach by year</figcaption>
        </figure>
        <img src="blob:https://chatgpt.com/safe-image" alt="Rendered image">
        <img src="https://example.com/already-rendered.png" alt="Remote response image">
      `),
      "media-response",
    );
    const sanitized = fixture(html);

    expect(sanitized.querySelectorAll("img")).toHaveLength(3);
    expect(sanitized.querySelector("figure")?.id).toContain("media-response");
    expect(sanitized.querySelector("img")?.getAttribute("onclick")).toBeNull();
    expect(text).toContain("Campaign timeline\nCampaign reach by year");
    expect(text).toContain("Rendered image");
    expect(text).not.toContain("data:image");
  });

  it("rejects unsafe image sources and arbitrary SVG while retaining decorative alternatives", () => {
    const { html, text } = sanitizeResponseHtml(
      fixture(`
        <img src="javascript:alert(1)" alt="Unsafe">
        <img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="Unsafe SVG">
        <svg onload="alert(1)"><script>alert(2)</script><circle></circle></svg>
        <img src="data:image/png;base64,AAAA" alt="">
        <img src="data:image/png;base64,BBBB">
      `),
    );
    const sanitized = fixture(html);

    expect(sanitized.querySelector("svg")).toBeNull();
    expect(sanitized.querySelectorAll("img")).toHaveLength(2);
    expect(sanitized.querySelectorAll("img")[0].getAttribute("alt")).toBe("");
    expect(sanitized.querySelectorAll("img")[1].getAttribute("alt")).toBe("Generated chart");
    expect(html).not.toContain("javascript:");
    expect(text).toBe("Generated chart");
  });

  it("rejects Google favicon-service images without creating media or failure output", () => {
    const { html, text } = sanitizeResponseHtml(
      fixture(`
        <p>
          <a href="https://www.masswerk.at/">
            <img alt="" width="128" height="128" src="https://www.google.com/s2/favicons?domain=https://www.masswerk.at&amp;sz=128">
            mass:werk
          </a>
        </p>
      `),
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("Visual could not be captured");
    expect(html).toContain('href="https://www.masswerk.at/"');
    expect(text).toBe("mass:werk");
  });

  it("creates document-wide unique source and heading IDs per stable block", () => {
    const first = sanitizeResponseHtml(
      fixture(
        '<h2>Repeated heading</h2><table><tr><th id="name">Name</th><td headers="name">A</td></tr></table>',
      ),
      "assistant-one",
    );
    const second = sanitizeResponseHtml(
      fixture(
        '<h2>Repeated heading</h2><table><tr><th id="name">Name</th><td headers="name">B</td></tr></table>',
      ),
      "assistant-two",
    );
    const firstDom = fixture(first.html);
    const secondDom = fixture(second.html);
    const firstIds = Array.from(
      firstDom.querySelectorAll<HTMLElement>("[id]"),
      (element) => element.id,
    );
    const secondIds = Array.from(
      secondDom.querySelectorAll<HTMLElement>("[id]"),
      (element) => element.id,
    );

    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    expect(firstDom.querySelector("h2")?.id).not.toBe(secondDom.querySelector("h2")?.id);
    expect(firstDom.querySelector("h2")?.id).toContain("assistant-one");
    expect(secondDom.querySelector("h2")?.id).toContain("assistant-two");
    expect(firstDom.querySelector("td")?.getAttribute("headers")).toBe(
      firstDom.querySelector("th")?.id,
    );
    expect(secondDom.querySelector("td")?.getAttribute("headers")).toBe(
      secondDom.querySelector("th")?.id,
    );
  });

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

  it("retains only an explicit safe code language marker", () => {
    const { html } = sanitizeResponseHtml(
      fixture(
        '<pre class="host-wrapper"><code class="language-rust host-token">fn main() {}</code></pre>',
      ),
    );
    expect(html).toContain('<code lang="rust">');
    expect(html).not.toContain("host-wrapper");
    expect(html).not.toContain("host-token");
  });
});
