import { createRoot, type Root } from "react-dom/client";

import { loadReaderPreferences } from "../shared/storage";
import type { ExtractedResponse } from "../shared/types";
import readerStyles from "./reader.css?inline";
import readerPrintStyles from "./reader.print.css?inline";
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

export async function mountReader(
  responses: ExtractedResponse[],
  initialResponseIndex = responses.length - 1,
): Promise<() => void> {
  const requestId = ++mountRequestId;
  cleanupActiveReader(true);
  removeOrphanArtifacts();

  if (responses.length === 0) {
    return () => undefined;
  }

  const previouslyFocused = getDeepActiveElement();
  const preferences = await loadReaderPreferences();

  // A newer mount or explicit unmount may have happened while storage was loading.
  if (requestId !== mountRequestId) {
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
  style.textContent = `${readerStyles}\n${readerPrintStyles}`;
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
        responses={responses}
        initialResponseIndex={Math.min(Math.max(initialResponseIndex, 0), responses.length - 1)}
        initialPreferences={preferences}
        onClose={() => queueMicrotask(cleanup)}
      />,
    );
  } catch (error) {
    cleanupActiveReader(true);
    throw error;
  }

  return cleanup;
}
