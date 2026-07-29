import readerStyles from "../../src/reader/reader.css?inline";
import {
  assignHighlightBlockIds,
  renderHighlights,
} from "../../src/reader/highlights/highlightAnchoring";
import type { HighlightRecord } from "../../src/shared/highlights";

declare global {
  interface Window {
    __HIGHLIGHT_RESULTS__?: Record<string, unknown>;
  }
}

const host = document.querySelector<HTMLElement>("#highlight-harness");
if (!host) {
  throw new Error("Highlight harness host is missing");
}

const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = `${readerStyles}
  :host { display: block; height: auto; overflow: visible; }
  .rb-reader { display: block; min-height: 420px; padding: 48px; }
  .rb-content { max-width: 720px; }
`;
const reader = document.createElement("div");
reader.className = "rb-reader";
reader.dataset.appearance = "light";
reader.innerHTML = `<article class="rb-content"><p>Alpha important passage omega.</p></article>`;
shadow.append(style, reader);

const response = reader.querySelector<HTMLElement>(".rb-content")!;
const block = assignHighlightBlockIds(response)[0];
const highlight: HighlightRecord = {
  id: "browser-highlight",
  conversationKey: "chatgpt:browser",
  sectionKey: "chatgpt:response",
  blockId: block.dataset.rbHighlightBlockId!,
  selectedText: "important passage",
  prefix: "Alpha ",
  suffix: " omega.",
  startOffset: 6,
  endOffset: 23,
  style: "yellow",
  createdAt: 1,
  updatedAt: 1,
  schemaVersion: 1,
};
let activationCount = 0;
renderHighlights(response, [highlight], () => {
  activationCount += 1;
});

await new Promise((resolveFrame) =>
  requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
);
const mark = response.querySelector<HTMLElement>("mark[data-rb-highlight-id]")!;
const lightStyle = getComputedStyle(mark);
const light = {
  background: lightStyle.backgroundColor,
  color: lightStyle.color,
  decoration: lightStyle.textDecorationLine,
};
mark.click();
reader.dataset.appearance = "dark";
await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
const darkStyle = getComputedStyle(mark);

window.__HIGHLIGHT_RESULTS__ = {
  activationCount,
  ariaLabel: mark.getAttribute("aria-label"),
  dark: { background: darkStyle.backgroundColor, color: darkStyle.color },
  light,
  markCount: response.querySelectorAll("mark[data-rb-highlight-id]").length,
  role: mark.getAttribute("role"),
  tabIndex: mark.tabIndex,
  text: mark.textContent,
};
