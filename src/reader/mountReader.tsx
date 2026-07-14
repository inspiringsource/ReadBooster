import { createRoot } from "react-dom/client";

import { loadReaderPreferences } from "../shared/storage";
import type { ExtractedResponse } from "../shared/types";
import readerStyles from "./reader.css?inline";
import { ReaderView } from "./ReaderView";

export const READER_HOST_ID = "readbooster-reader-root";
const PRINT_STYLE_ID = "readbooster-print-style";

let activeReaderCleanup: (() => void) | null = null;

function getDeepActiveElement(): HTMLElement | null {
  let activeElement: Element | null = document.activeElement;
  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement;
  }
  return activeElement instanceof HTMLElement ? activeElement : null;
}

export async function mountReader(response: ExtractedResponse): Promise<() => void> {
  activeReaderCleanup?.();

  const previouslyFocused = getDeepActiveElement();
  const preferences = await loadReaderPreferences();
  const host = document.createElement("div");
  host.id = READER_HOST_ID;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = readerStyles;
  const mountPoint = document.createElement("div");
  shadow.append(style, mountPoint);

  const printStyle = document.createElement("style");
  printStyle.id = PRINT_STYLE_ID;
  printStyle.textContent = `
    @media print {
      body > *:not(#${READER_HOST_ID}) { display: none !important; }
      #${READER_HOST_ID} { position: static !important; }
    }
  `;
  document.head.append(printStyle);
  document.body.append(host);

  const root = createRoot(mountPoint);
  let closed = false;
  const cleanup = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    root.unmount();
    host.remove();
    printStyle.remove();
    if (activeReaderCleanup === cleanup) {
      activeReaderCleanup = null;
    }
    previouslyFocused?.focus();
  };

  activeReaderCleanup = cleanup;
  root.render(
    <ReaderView
      response={response}
      initialPreferences={preferences}
      onClose={() => queueMicrotask(cleanup)}
    />,
  );
  return cleanup;
}
