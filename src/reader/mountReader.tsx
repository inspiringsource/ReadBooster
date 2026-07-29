import { createRoot, type Root } from "react-dom/client";

import { flushHighlightWrites, loadHighlightsWithStatus } from "../shared/highlightRepository";
import { loadReaderPreferences, loadSectionTitleOverrides } from "../shared/storage";
import { flushStickerWrites, loadStickersWithStatus } from "../shared/stickerRepository";
import type {
  ConversationDocument,
  ConversationTurn,
  DocumentContentBlock,
  ExtractedResponse,
  RefreshConversation,
} from "../shared/types";
import { assistantBlocks } from "../shared/types";
import readerStyles from "./reader.css?inline";
import readerPrintStyles from "./reader.print.css?inline";
import {
  fastReadingFontFace,
  registerFastReadingFont,
  unregisterFastReadingFont,
} from "./fastReadingFont";
import { ReaderView } from "./ReaderView";

export const READER_HOST_ID = "readbooster-reader-root";
const PRINT_STYLE_ID = "readbooster-print-style";

interface InertSnapshot {
  element: HTMLElement;
  hadAttribute: boolean;
  attributeValue: string | null;
}

interface ActiveReader {
  root: Root;
  host: HTMLElement;
  printStyle: HTMLStyleElement;
  previouslyFocused: HTMLElement | null;
  restoreInert: () => void;
  fastReadingFont: FontFace | null;
  closed: boolean;
}

let activeReader: ActiveReader | null = null;
let mountRequestId = 0;

function getDeepActiveElement(): HTMLElement | null {
  let activeElement: Element | null = document.activeElement;
  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement;
  }
  return activeElement instanceof HTMLElement ? activeElement : null;
}

function makeBackgroundInert(host: HTMLElement): () => void {
  const snapshots: InertSnapshot[] = [];
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement) || child === host) {
      continue;
    }
    snapshots.push({
      element: child,
      hadAttribute: child.hasAttribute("inert"),
      attributeValue: child.getAttribute("inert"),
    });
    child.inert = true;
  }

  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    for (const snapshot of snapshots) {
      if (snapshot.hadAttribute) {
        snapshot.element.setAttribute("inert", snapshot.attributeValue ?? "");
      } else {
        snapshot.element.removeAttribute("inert");
      }
    }
  };
}

function removeOrphanArtifacts(): void {
  document.querySelectorAll(`#${READER_HOST_ID}`).forEach((element) => element.remove());
  document.querySelectorAll(`#${PRINT_STYLE_ID}`).forEach((element) => element.remove());
}

function cleanupActiveReader(restoreFocus: boolean): void {
  const reader = activeReader;
  if (!reader || reader.closed) {
    return;
  }

  reader.closed = true;
  activeReader = null;
  try {
    reader.root.unmount();
  } finally {
    reader.host.remove();
    reader.printStyle.remove();
    unregisterFastReadingFont(reader.fastReadingFont);
    reader.restoreInert();
    if (restoreFocus && reader.previouslyFocused?.isConnected) {
      reader.previouslyFocused.focus();
    }
  }
}

export function unmountReader(): void {
  mountRequestId += 1;
  cleanupActiveReader(true);
  removeOrphanArtifacts();
}

export type ReaderInitialSelection = DocumentContentBlock | ConversationTurn | string | undefined;

function legacyResponsesToDocument(responses: readonly ExtractedResponse[]): ConversationDocument {
  const turns = responses.map((response, index) => {
    const block: DocumentContentBlock = {
      id: response.id,
      role: "assistant",
      html: response.html,
      text: response.text,
      provenance: {
        kind: "original",
        platform: response.source,
        sourceUrl: "",
        extractedAt: response.extractedAt,
        contentFingerprint: `legacy-${response.id}`,
      },
    };
    return { id: `legacy-turn-${index}`, index, prompt: null, response: block };
  });
  return {
    id: "legacy-response-document",
    source: responses[0]?.source ?? "chatgpt",
    title: null,
    sourceUrl: "",
    extractedAt: responses[0]?.extractedAt ?? new Date().toISOString(),
    turns,
  };
}

function selectedBlockId(
  conversation: ConversationDocument,
  selection: ReaderInitialSelection | number,
): string | undefined {
  const responses = assistantBlocks(conversation);
  if (typeof selection === "number") {
    return responses[Math.min(Math.max(selection, 0), responses.length - 1)]?.id;
  }
  if (typeof selection === "string") {
    return selection;
  }
  if (selection && "role" in selection) {
    return selection.role === "assistant" ? selection.id : undefined;
  }
  if (selection?.response) {
    return selection.response.id;
  }
  return responses.at(-1)?.id;
}

export function mountReader(
  conversation: ConversationDocument,
  initialSelection?: ReaderInitialSelection,
  refreshConversation?: RefreshConversation,
): Promise<() => void>;
/** @deprecated Compatibility boundary for 0.2.x callers and fixtures. */
export function mountReader(
  responses: ExtractedResponse[],
  initialResponseIndex?: number,
): Promise<() => void>;
export async function mountReader(
  input: ConversationDocument | ExtractedResponse[],
  initialSelection?: ReaderInitialSelection | number,
  refreshConversation?: RefreshConversation,
): Promise<() => void> {
  const conversation = Array.isArray(input) ? legacyResponsesToDocument(input) : input;
  const responses = assistantBlocks(conversation);
  const initialResponseId = selectedBlockId(conversation, initialSelection);
  const requestId = ++mountRequestId;
  // Explicit Sticker saves are queued to serialize storage.local updates. A remount must observe
  // every prior write instead of loading a stale snapshot while the previous Reader closes.
  await Promise.all([flushStickerWrites(), flushHighlightWrites()]);
  if (requestId !== mountRequestId) {
    return () => undefined;
  }
  cleanupActiveReader(true);
  removeOrphanArtifacts();

  if (responses.length === 0) {
    return () => undefined;
  }

  const previouslyFocused = getDeepActiveElement();
  const [preferences, sectionTitleOverrides, stickerLoad, highlightLoad] = await Promise.all([
    loadReaderPreferences(),
    loadSectionTitleOverrides(conversation),
    loadStickersWithStatus(conversation),
    loadHighlightsWithStatus(conversation),
  ]);
  const fastReadingFont = registerFastReadingFont();

  // A newer mount or explicit unmount may have happened while storage was loading.
  if (requestId !== mountRequestId) {
    unregisterFastReadingFont(fastReadingFont);
    return () => undefined;
  }
  cleanupActiveReader(true);
  removeOrphanArtifacts();

  const host = document.createElement("div");
  host.id = READER_HOST_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.height = "100dvh";
  host.style.maxHeight = "100dvh";
  host.style.overflow = "hidden";
  host.style.width = "100%";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${fastReadingFontFace()}\n${readerStyles}\n${readerPrintStyles}`;
  const mountPoint = document.createElement("div");
  mountPoint.className = "rb-reader-mount";
  shadow.append(style, mountPoint);

  const printStyle = document.createElement("style");
  printStyle.id = PRINT_STYLE_ID;
  printStyle.textContent = `
    @page {
      margin: 12mm;
      size: auto;
    }

    @media print {
      body > *:not(#${READER_HOST_ID}) { display: none !important; }
      #${READER_HOST_ID} {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        position: static !important;
        width: auto !important;
      }
    }
  `;
  document.head.append(printStyle);
  document.body.append(host);

  const restoreInert = makeBackgroundInert(host);
  const root = createRoot(mountPoint);
  const reader: ActiveReader = {
    root,
    host,
    printStyle,
    previouslyFocused,
    restoreInert,
    fastReadingFont,
    closed: false,
  };
  activeReader = reader;

  const cleanup = (): void => {
    if (activeReader === reader) {
      cleanupActiveReader(true);
    }
  };

  try {
    root.render(
      <ReaderView
        conversation={conversation}
        initialResponseId={initialResponseId}
        initialPreferences={preferences}
        initialSectionTitleOverrides={sectionTitleOverrides}
        initialStickers={stickerLoad.stickers}
        initialStickerPersistenceWarning={
          stickerLoad.status === "failed" || stickerLoad.status === "unavailable"
            ? "Saved Stickers could not be loaded from local storage."
            : undefined
        }
        initialHighlights={highlightLoad.highlights}
        initialHighlightPersistenceWarning={
          highlightLoad.status === "failed" || highlightLoad.status === "unavailable"
            ? "Saved highlights could not be loaded from local storage."
            : highlightLoad.status === "not-persistable"
              ? "Highlights are temporary because this conversation could not be identified reliably."
              : undefined
        }
        refreshConversation={refreshConversation}
        onClose={() => {
          void Promise.all([flushStickerWrites(), flushHighlightWrites()]).finally(() =>
            queueMicrotask(cleanup),
          );
        }}
      />,
    );
  } catch (error) {
    cleanupActiveReader(true);
    throw error;
  }

  return cleanup;
}
