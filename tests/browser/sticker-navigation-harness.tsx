import { createElement } from "react";
import { createRoot } from "react-dom/client";

import readerStyles from "../../src/reader/reader.css?inline";
import { StickerNavigation } from "../../src/reader/stickers/StickerNavigation";
import type { Sticker } from "../../src/shared/stickers";

const host = document.querySelector<HTMLElement>("#sticker-navigation-harness");
if (!host) {
  throw new Error("Sticker navigation harness host is missing");
}

const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = `${readerStyles}
  .rb-document-section { min-height: 900px; }
  .rb-sticker { top: 180px; right: 0; }
`;
const reader = document.createElement("div");
reader.className = "rb-reader";
reader.dataset.appearance = "light";
reader.innerHTML = `
  <header class="rb-toolbar"><strong>Sticker navigation probe</strong></header>
  <div class="rb-reader-body" data-outline-open="false">
    <aside class="rb-outline" hidden><h2>Conversation outline</h2></aside>
    <main class="rb-scroll-area rb-document-scroll" data-rb-scroll-container="vertical">
      <article class="rb-document-surface">
        ${[1, 2, 3, 4]
          .map(
            (number) => `
              <section class="rb-document-section" data-rb-section-id="section-${number}" aria-labelledby="section-${number}-title">
                <div class="rb-section-reading-column">
                  <header class="rb-document-section-header"><h2 id="section-${number}-title">Section ${number}</h2></header>
                  <article class="rb-content rb-content--document"><p>Long reading section ${number}</p></article>
                </div>
                <aside class="rb-sticker-layer">
                  <aside class="rb-sticker rb-sticker--collapsed" data-rb-sticker-id="sticker-${number}" data-rb-sticker-y-ratio="0.2">
                    <button class="rb-sticker-collapsed-content" type="button" aria-label="Open sticker attached to Section ${number}">
                      <span class="rb-sticker-note-icon" aria-hidden="true">▤</span>
                    </button>
                  </aside>
                </aside>
              </section>`,
          )
          .join("")}
      </article>
    </main>
    <div data-rb-navigation-root style="display: contents"></div>
  </div>
`;
shadow.append(style, reader);

const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
const navigationRoot = shadow.querySelector<HTMLElement>("[data-rb-navigation-root]")!;
const nativeScrollTo = scrollArea.scrollTo.bind(scrollArea);
scrollArea.scrollTo = (optionsOrX?: ScrollToOptions | number, y?: number): void => {
  window.__STICKER_NAVIGATION_SCROLL_BEHAVIOR__ =
    typeof optionsOrX === "object" ? (optionsOrX.behavior ?? "auto") : "auto";
  if (typeof optionsOrX === "number") {
    nativeScrollTo(optionsOrX, y ?? 0);
  } else {
    nativeScrollTo(optionsOrX);
  }
};
const stickers: Sticker[] = [1, 2, 3, 4].map((number) => ({
  id: `sticker-${number}`,
  conversationKey: "gemini:navigation-harness",
  sectionKey: `gemini:response-${number}`,
  text: `Navigation note ${number}`,
  position: { xRatio: 1, yRatio: 0.2 },
  isPinned: true,
  isCollapsed: true,
  createdAt: number,
  updatedAt: number,
  schemaVersion: 1,
}));

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }),
});

createRoot(navigationRoot).render(
  createElement(StickerNavigation, {
    scrollAreaRef: { current: scrollArea },
    stickers,
  }),
);

async function settle(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

await settle();
const secondSection = shadow.querySelector<HTMLElement>('[data-rb-section-id="section-2"]')!;
scrollArea.scrollTop = Math.max(0, secondSection.offsetTop - 160);
scrollArea.dispatchEvent(new Event("scroll"));
await settle();
window.__STICKER_NAVIGATION_READY__ = true;

declare global {
  interface Window {
    __STICKER_NAVIGATION_READY__: boolean;
    __STICKER_NAVIGATION_SCROLL_BEHAVIOR__: ScrollBehavior | undefined;
  }
}
