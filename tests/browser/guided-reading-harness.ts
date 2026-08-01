import readerStyles from "../../src/reader/reader.css?inline";
import {
  applyReadingBlockMetadata,
  discoverReadingBlocks,
  setReadingBlockStates,
} from "../../src/reader/guidedReading/readingBlocks";

declare global {
  interface Window {
    __GUIDED_READING_RESULTS__?: Record<string, unknown>;
  }
}

const host = document.querySelector<HTMLElement>("#guided-reading-harness");
if (!host) throw new Error("Guided Reading harness host is missing");

const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = `${readerStyles}
  :host { display: block; height: 900px; overflow: visible; }
  .rb-reader { display: block; min-height: 900px; padding: 40px; }
  .rb-scroll-area { height: 760px; padding: 32px; }
  .rb-content { max-width: 720px; }
`;
const reader = document.createElement("div");
reader.className = "rb-reader";
reader.dataset.appearance = "light";
reader.dataset.guidedReading = "off";
reader.innerHTML = `
  <main class="rb-scroll-area">
    <section data-rb-section-id="browser-section">
      <article class="rb-content rb-content--document" data-rb-response-id="browser-response">
        <h2>Guided Reading</h2>
        <p>First passage remains readable.</p>
        <ul><li>One list item</li><li>Another list item</li></ul>
        <div class="rb-table-block"><table><tr><th>Item</th><th>Value</th></tr><tr><td>Mode</td><td>Guided</td></tr></table></div>
        <div class="rb-code-block"><pre><code>const calm = true;</code></pre></div>
        <figure><svg viewBox="0 0 120 40" aria-label="Reading diagram"><rect width="120" height="40"></rect></svg><figcaption>Reading diagram</figcaption></figure>
      </article>
    </section>
  </main>`;
shadow.append(style, reader);

const scrollArea = reader.querySelector<HTMLElement>(".rb-scroll-area")!;
const content = reader.querySelector<HTMLElement>(".rb-content")!;
const widthBefore = content.getBoundingClientRect().width;
const entries = discoverReadingBlocks(scrollArea);
applyReadingBlockMetadata(entries);
setReadingBlockStates(entries, entries[1]?.id ?? null);
reader.dataset.guidedReading = "focused";
await new Promise((resolveFrame) =>
  requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
);

const active = entries[1].element;
const distant = entries.at(-1)!.element;
const table = entries.find((entry) => entry.kind === "table")!.element;
table.dataset.rbTableFullscreen = "true";
const focused = {
  activeBackground: getComputedStyle(active).backgroundColor,
  activeOpacity: getComputedStyle(active).opacity,
  distantOpacity: getComputedStyle(distant).opacity,
  contentWidth: content.getBoundingClientRect().width,
  fullscreenTableOpacity: getComputedStyle(table).opacity,
  tableOverflow: getComputedStyle(table).overflowX,
};
delete table.dataset.rbTableFullscreen;

reader.dataset.guidedReading = "soft";
reader.dataset.appearance = "dark";
await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
const softDark = {
  activeBackground: getComputedStyle(active).backgroundColor,
  distantOpacity: getComputedStyle(distant).opacity,
  textColor: getComputedStyle(distant).color,
};

window.__GUIDED_READING_RESULTS__ = {
  activeCount: entries.filter((entry) => entry.element.dataset.rbGuidedState === "active").length,
  blockCount: entries.length,
  blockKinds: entries.map((entry) => entry.kind),
  focused,
  idsUnique: new Set(entries.map((entry) => entry.id)).size === entries.length,
  softDark,
  transitionDuration: getComputedStyle(active).transitionDuration,
  widthBefore,
};
