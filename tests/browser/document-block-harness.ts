import readerStyles from "../../src/reader/reader.css?inline";
import { enhanceTables } from "../../src/reader/blockControls";
import { enhanceCodeBlocks } from "../../src/reader/codeControls";
import { enhanceDocumentBlocks } from "../../src/reader/documentBlockControls";

declare global {
  interface Window {
    __DOCUMENT_BLOCK_RESULTS__?: Record<string, unknown>;
  }
}

const host = document.querySelector<HTMLElement>("#document-block-harness");
if (!host) {
  throw new Error("Document-block harness host is missing");
}

const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = `${readerStyles}
  :host { height: auto; overflow: visible; }
  .rb-reader { display: block; min-height: 700px; padding: 48px; }
  .rb-content { max-width: 760px; }
`;

const reader = document.createElement("div");
reader.className = "rb-reader";
reader.dataset.appearance = "light";
reader.dataset.readingStyle = "default";
reader.innerHTML = `
  <article class="rb-content rb-content--document">
    <p data-surrounding="before">Introductory text.</p>
    <div data-readbooster-content-block="document">
      <h2>Interview preparation</h2>
      <p>Tell me about yourself.</p>
      <ul><li>Keep the answer concise.</li><li>Connect it to the role.</li></ul>
      <table><thead><tr><th>Topic</th><th>Goal</th></tr></thead><tbody><tr><td>Experience</td><td>Relevance</td></tr></tbody></table>
      <pre><code lang="typescript">const concise = true;</code></pre>
    </div>
    <p data-surrounding="after">Concluding text.</p>
  </article>
`;
shadow.append(style, reader);

const response = reader.querySelector<HTMLElement>(".rb-content")!;
const widthBeforeEnhancement = response.getBoundingClientRect().width;
enhanceDocumentBlocks(response);
enhanceTables(response, { responseKey: "document-block-browser", sessionStates: new Map() });
enhanceCodeBlocks(response, { appearance: "plain" });

await new Promise((resolveFrame) =>
  requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
);

const block = response.querySelector<HTMLElement>(".rb-document-block")!;
const header = block.querySelector<HTMLElement>(".rb-document-block__header")!;
const label = block.querySelector<HTMLElement>(".rb-document-block__label")!;
const copy = block.querySelector<HTMLButtonElement>('[aria-label="Copy document"]')!;
const content = block.querySelector<HTMLElement>(".rb-document-block__content")!;
const bodyParagraph = content.querySelector<HTMLElement>("p")!;
const lightBlockStyle = getComputedStyle(block);
const lightLabelStyle = getComputedStyle(label);
const contentStyle = getComputedStyle(content);
const paragraphStyle = getComputedStyle(bodyParagraph);
const lightAppearance = {
  background: lightBlockStyle.backgroundColor,
  borderStyle: lightBlockStyle.borderStyle,
  labelColor: lightLabelStyle.color,
};

reader.dataset.appearance = "dark";
await new Promise((resolveFrame) =>
  requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
);
const darkBlockStyle = getComputedStyle(block);
const darkLabelStyle = getComputedStyle(label);

window.__DOCUMENT_BLOCK_RESULTS__ = {
  blockTag: block.tagName,
  blockCount: response.querySelectorAll(".rb-document-block").length,
  label: label.textContent,
  copyLabel: copy.getAttribute("aria-label"),
  widthBeforeEnhancement,
  widthAfterEnhancement: response.getBoundingClientRect().width,
  sourceOrder: Array.from(response.children).map((element) =>
    element.matches(".rb-document-block") ? "document" : element.getAttribute("data-surrounding"),
  ),
  hasContentEditable: block.querySelector("[contenteditable]") !== null,
  hasCodeToolbar: block.querySelector(".rb-code-toolbar") !== null,
  hasTableToolbar: block.querySelector(".rb-block-toolbar") !== null,
  headerDisplay: getComputedStyle(header).display,
  contentOverflow: contentStyle.overflow,
  contentMaxHeight: contentStyle.maxHeight,
  contentFontFamily: paragraphStyle.fontFamily,
  responseFontFamily: getComputedStyle(response).fontFamily,
  light: lightAppearance,
  dark: {
    background: darkBlockStyle.backgroundColor,
    labelColor: darkLabelStyle.color,
  },
};
