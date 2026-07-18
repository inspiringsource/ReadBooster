import readerStyles from "../../src/reader/reader.css?inline";
import { fastReadingFontFace, registerFastReadingFont } from "../../src/reader/fastReadingFont";

const shadowOnlyRegistration = new URLSearchParams(window.location.search).has("shadow-only");

const sampleParagraphs = [
  "First, a fun quirk: Switzerland doesn't actually have an official capital.",
  'When the modern federal state was founded in 1848, lawmakers wanted to avoid giving too much power to economic powerhouses like Zurich or Geneva. So, they compromised and chose Bern to host the parliament and government. Today, Bern is referred to as the "Federal City" (Bundesstadt), and it functions as the capital in every practical sense.',
];

function section(label: string): HTMLElement {
  const sectionElement = document.createElement("section");
  sectionElement.className = "rb-document-section";
  sectionElement.innerHTML = `
    <header class="rb-document-section-header">
      <span class="rb-section-indicator">Section ${label}</span>
      <h2>The "Capital" City</h2>
    </header>
    <article class="rb-content rb-content--document">
      <p>${sampleParagraphs[0]}</p>
      <p>${sampleParagraphs[1]} <strong>Bold fixation text</strong> <b>Bold element text</b></p>
      <table><tbody><tr><th>Table heading</th><td>Table reading text</td></tr></tbody></table>
      <p><code>const excluded = true;</code></p>
      <p class="math" role="math">x + y = z</p>
    </article>
  `;
  return sectionElement;
}

function readerSample(style: string, sample: string, contextualAlternates = true): HTMLElement {
  const reader = document.createElement("div");
  reader.className = `rb-reader rb-sample${contextualAlternates ? "" : " rb-calt-disabled"}`;
  reader.dataset.appearance = "light";
  reader.dataset.readingStyle = style;
  reader.dataset.sample = sample;
  reader.dataset.mode = "document";
  reader.style.setProperty("--rb-font-size", "24px");
  reader.style.setProperty("--rb-line-height", "1.45");
  reader.innerHTML = `
    <div class="rb-reader-body">
      <main class="rb-scroll-area rb-document-scroll">
        <article class="rb-document-surface"></article>
      </main>
    </div>
  `;
  reader.querySelector(".rb-document-surface")?.append(section("1"));
  return reader;
}

const host = document.querySelector<HTMLElement>("#fast-reading-harness");
if (!host) {
  throw new Error("Fast Reading harness host is missing");
}

const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = `${shadowOnlyRegistration ? fastReadingFontFace("/fonts/Fast_Sans.ttf") : ""}
${readerStyles}
  :host { height: auto; overflow: visible; }
  .rb-harness-grid { display: grid; gap: 24px; grid-template-columns: repeat(3, 720px); }
  .rb-sample { display: block; height: 620px; overflow: hidden; width: 720px; }
  .rb-reader-body, .rb-scroll-area { height: auto; max-height: none; overflow: visible; }
  .rb-document-scroll { padding: 0; }
  .rb-document-surface { border: 0; border-radius: 0; box-shadow: none; max-width: none; padding: 28px; }
  .rb-content { max-width: none; }
  .rb-calt-disabled :is(.rb-content, .rb-document-section-header h2),
  .rb-calt-disabled .rb-content * {
    font-feature-settings: "calt" 0;
    font-variant-ligatures: none;
  }
`;
const grid = document.createElement("div");
grid.className = "rb-harness-grid";
const defaultReader = readerSample("default", "default");
const fastWithoutAlternates = readerSample("fast-reading", "fast-without-calt", false);
const fastReader = readerSample("fast-reading", "fast");
grid.append(defaultReader, fastWithoutAlternates, fastReader);
const focusReader = document.createElement("div");
focusReader.className = "rb-reader rb-focus-probe";
focusReader.dataset.appearance = "light";
focusReader.dataset.readingStyle = "fast-reading";
focusReader.dataset.mode = "focus";
focusReader.style.setProperty("--rb-font-size", "24px");
focusReader.style.setProperty("--rb-line-height", "1.45");
focusReader.innerHTML =
  '<main class="rb-scroll-area" aria-label="Focused response content"></main>';
focusReader.querySelector("main")?.append(section("focus").querySelector(".rb-content")!);
shadow.append(style, grid, focusReader);

if (!shadowOnlyRegistration) {
  const face = registerFastReadingFont("/fonts/Fast_Sans.ttf");
  if (!face) {
    throw new Error("Fast Reading font registration failed");
  }
}
await document.fonts.load('400 24px "ReadBooster Fast Sans"');

const dynamicSection = section("2");
fastReader.querySelector(".rb-document-surface")?.append(dynamicSection);

function computed(selector: string, root: ParentNode = fastReader): CSSStyleDeclaration {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing harness element: ${selector}`);
  }
  return getComputedStyle(element);
}

const firstParagraph = computed(".rb-document-section:first-child .rb-content p");
const lastParagraph = computed(".rb-document-section:last-child .rb-content p");
const sectionHeading = computed(".rb-document-section-header h2");
const strong = computed("strong");
const bold = computed("b");
const code = computed("code");
const math = computed(".math");
const focusParagraph = computed(".rb-content p", focusReader);

window.__FAST_READING_RESULTS__ = {
  registrationMode: shadowOnlyRegistration ? "shadow-only" : "document-font-face-set",
  fontCheck: document.fonts.check('400 24px "ReadBooster Fast Sans"'),
  loadedFaceCount: (await document.fonts.load('400 24px "ReadBooster Fast Sans"')).length,
  paragraph: {
    fontFamily: firstParagraph.fontFamily,
    fontFeatureSettings: firstParagraph.fontFeatureSettings,
    fontVariantLigatures: firstParagraph.fontVariantLigatures,
    fontWeight: firstParagraph.fontWeight,
  },
  lastParagraph: {
    fontFamily: lastParagraph.fontFamily,
    fontFeatureSettings: lastParagraph.fontFeatureSettings,
  },
  sectionHeading: {
    fontFamily: sectionHeading.fontFamily,
    fontWeight: sectionHeading.fontWeight,
  },
  strong: {
    fontFamily: strong.fontFamily,
    fontFeatureSettings: strong.fontFeatureSettings,
    fontWeight: strong.fontWeight,
  },
  bold: {
    fontFamily: bold.fontFamily,
    fontFeatureSettings: bold.fontFeatureSettings,
    fontWeight: bold.fontWeight,
  },
  focusParagraph: {
    fontFamily: focusParagraph.fontFamily,
    fontFeatureSettings: focusParagraph.fontFeatureSettings,
  },
  code: {
    fontFamily: code.fontFamily,
    fontFeatureSettings: code.fontFeatureSettings,
  },
  math: {
    fontFamily: math.fontFamily,
    fontFeatureSettings: math.fontFeatureSettings,
  },
  defaultParagraph: computed(".rb-content p", defaultReader).fontFamily,
};

declare global {
  interface Window {
    __FAST_READING_RESULTS__: Record<string, unknown>;
  }
}
