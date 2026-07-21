import readerStyles from "../../src/reader/reader.css?inline";
import { calculateStickerMenuPosition } from "../../src/reader/stickers/stickerMenuPositioning";
import { resolveStickerMarginPositions } from "../../src/reader/stickers/stickerPositioning";

const host = document.querySelector<HTMLElement>("#sticker-layout-harness");
if (!host) {
  throw new Error("Sticker layout harness host is missing");
}

const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = `${readerStyles}
  .rb-document-section { min-height: 640px; }
`;

const reader = document.createElement("div");
reader.className = "rb-reader";
reader.dataset.appearance = "light";
reader.dataset.mode = "document";
reader.dataset.readingStyle = "default";
reader.style.setProperty("--rb-font-size", "19px");
reader.style.setProperty("--rb-line-height", "1.72");
reader.innerHTML = `
  <header class="rb-toolbar">
    <div class="rb-toolbar-primary"><strong>ReadBooster layout probe</strong></div>
  </header>
  <div class="rb-reader-body" data-outline-open="false">
    <aside class="rb-outline" hidden><h2>Conversation outline</h2></aside>
    <main class="rb-scroll-area rb-document-scroll">
      <article class="rb-document-surface">
        <section class="rb-document-section">
          <div class="rb-section-reading-column">
            <header class="rb-document-section-header">
              <div>
                <span class="rb-section-indicator">Section 1</span>
                <h2>Sticker layout section</h2>
              </div>
              <button type="button" class="rb-sticker-anchor">Add sticker</button>
            </header>
            <article class="rb-content rb-content--document">
              <p>ReadBooster keeps this primary reading column at its normal width.</p>
              <p>Changing reading style, text size, spacing, or outline visibility must not reserve a permanent annotation rail.</p>
              <p>Collapsed notes remain compact while one expanded note floats near its section.</p>
            </article>
          </div>
          <aside class="rb-sticker-layer">
            <button type="button" class="rb-sticker-drawer-backdrop" aria-label="Close expanded sticker"></button>
            <aside class="rb-sticker rb-sticker--collapsed" data-layout-sticker="first" style="right: 0">
              <button type="button" class="rb-sticker-collapsed-content" aria-label="Open sticker attached to “Sticker layout section”">
                <svg class="rb-sticker-note-icon" viewBox="0 0 24 24" aria-hidden="true" data-rb-sticker-note-icon><path d="M5.5 3.75h9.75l3.25 3.25v13.25H5.5z"/><path d="M15.25 3.75V7h3.25M8.5 11h7M8.5 14.5h7M8.5 18h4.5"/></svg>
              </button>
            </aside>
            <aside class="rb-sticker rb-sticker--collapsed" data-layout-sticker="second" style="right: 0">
              <button type="button" class="rb-sticker-collapsed-content" aria-label="Open sticker attached to “Sticker layout section”">
                <svg class="rb-sticker-note-icon" viewBox="0 0 24 24" aria-hidden="true" data-rb-sticker-note-icon><path d="M5.5 3.75h9.75l3.25 3.25v13.25H5.5z"/><path d="M15.25 3.75V7h3.25M8.5 11h7M8.5 14.5h7M8.5 18h4.5"/></svg>
              </button>
            </aside>
            <aside class="rb-sticker rb-sticker--expanded" data-layout-sticker="expanded" style="right: -64px">
              <div class="rb-sticker-header">
                <span>●</span>
                <button type="button" class="rb-sticker-menu-trigger" aria-label="Sticker actions">•••</button>
              </div>
              <button type="button" class="rb-sticker-text">A floating section note with enough text to represent a realistic review note in both margin and drawer layouts.</button>
            </aside>
          </aside>
        </section>
      </article>
    </main>
  </div>
`;

shadow.append(style, reader);
const menuPortal = document.createElement("div");
menuPortal.className = "rb-sticker-menu-portal";
menuPortal.dataset.rbStickerMenuPortal = "true";
menuPortal.innerHTML = `
  <div class="rb-sticker-menu" role="menu" aria-label="Sticker actions">
    <button type="button" role="menuitem" class="rb-sticker-menu-item">Edit</button>
    <button type="button" role="menuitem" class="rb-sticker-menu-item">Collapse</button>
    <button type="button" role="menuitem" class="rb-sticker-menu-item">Unpin</button>
    <button type="button" role="menuitem" class="rb-sticker-menu-item rb-sticker-menu-delete">Delete</button>
  </div>
`;
reader.append(menuPortal);

function positionStickerMenu(): void {
  const trigger = shadow.querySelector<HTMLElement>(".rb-sticker-menu-trigger")!;
  const menu = shadow.querySelector<HTMLElement>(".rb-sticker-menu")!;
  const position = calculateStickerMenuPosition(
    trigger.getBoundingClientRect(),
    menu.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight },
  );
  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
  menu.dataset.placement = position.placement;
}
const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;
const header = shadow.querySelector<HTMLElement>(".rb-document-section-header")!;
const sectionRect = section.getBoundingClientRect();
const safeTop = header.getBoundingClientRect().bottom - sectionRect.top + 20;
const positions = resolveStickerMarginPositions(
  [
    { id: "first", yRatio: 0, isPinned: false, isExpanded: false },
    { id: "second", yRatio: 0, isPinned: false, isExpanded: false },
    { id: "expanded", yRatio: 0, isPinned: false, isExpanded: true },
  ],
  sectionRect.height,
  safeTop,
);
for (const position of positions) {
  const element = shadow.querySelector<HTMLElement>(`[data-layout-sticker="${position.id}"]`)!;
  const yPercent = position.yRatio * 100;
  element.style.top = `calc(${yPercent}% - ${position.yRatio * 40}px)`;
}
positionStickerMenu();
window.addEventListener("resize", positionStickerMenu);
window.__STICKER_LAYOUT_READY__ = true;
window.__POSITION_STICKER_MENU__ = positionStickerMenu;

declare global {
  interface Window {
    __STICKER_LAYOUT_READY__: boolean;
    __POSITION_STICKER_MENU__: () => void;
  }
}
