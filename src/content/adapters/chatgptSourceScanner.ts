import type {
  ConversationScanSettledState,
  ConversationScanSource,
} from "../conversationSourceScanner";

const READER_HOST_SELECTOR = "#readbooster-reader-root";
const MINIMUM_SCROLL_OVERFLOW = 16;
const MINIMUM_SOURCE_VIEWPORT = 120;

function isReaderElement(element: Element): boolean {
  return element.matches(READER_HOST_SELECTOR) || Boolean(element.closest(READER_HOST_SELECTOR));
}

function containsCandidates(element: Element, candidates: readonly Element[]): boolean {
  return candidates.length > 0 && candidates.every((candidate) => element.contains(candidate));
}

function hasMeaningfulVerticalOverflow(element: HTMLElement): boolean {
  return (
    element.clientHeight >= MINIMUM_SOURCE_VIEWPORT &&
    element.scrollHeight > element.clientHeight + MINIMUM_SCROLL_OVERFLOW
  );
}

function hasScrollableStyle(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return false;
  }
  try {
    return /^(?:auto|scroll|overlay)$/.test(view.getComputedStyle(element).overflowY);
  } catch {
    return false;
  }
}

/**
 * Finds the nearest meaningful scrollable ancestor shared by the mounted message candidates.
 * ChatGPT's presentation classes are deliberately ignored. The document scroller is accepted only
 * as a fallback that still contains the current conversation window.
 */
export function findChatGPTConversationScroller(
  doc: Document,
  candidates: readonly Element[],
): HTMLElement | null {
  const sourceCandidates = candidates.filter(
    (candidate) => candidate.isConnected && !isReaderElement(candidate),
  );
  const first = sourceCandidates[0];
  if (!first) {
    return null;
  }

  let ancestor = first.parentElement;
  while (ancestor) {
    if (
      !isReaderElement(ancestor) &&
      containsCandidates(ancestor, sourceCandidates) &&
      hasMeaningfulVerticalOverflow(ancestor) &&
      hasScrollableStyle(ancestor)
    ) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }

  const documentScroller = doc.scrollingElement;
  if (
    documentScroller instanceof HTMLElement &&
    !isReaderElement(documentScroller) &&
    containsCandidates(documentScroller, sourceCandidates) &&
    hasMeaningfulVerticalOverflow(documentScroller)
  ) {
    return documentScroller;
  }
  return null;
}

export interface DomSettleOptions {
  readonly quietPeriodMs?: number;
  readonly maximumWaitMs?: number;
}

/** Waits for two frames and a short mutation-free window, with a hard per-position deadline. */
export function waitForChatGPTDomToSettle(
  container: HTMLElement,
  signal?: AbortSignal,
  { quietPeriodMs = 90, maximumWaitMs = 650 }: DomSettleOptions = {},
): Promise<ConversationScanSettledState> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Conversation scan aborted", "AbortError"));
  }

  const view = container.ownerDocument.defaultView ?? window;
  return new Promise((resolve, reject) => {
    let domChanged = false;
    let quietTimer: number | undefined;
    const timers: { maximum?: number } = {};
    const frameIds = new Set<number>();
    const fallbackFrameTimers = new Set<number>();

    const cleanup = (): void => {
      observer.disconnect();
      view.clearTimeout(quietTimer);
      view.clearTimeout(timers.maximum);
      frameIds.forEach((frameId) => view.cancelAnimationFrame?.(frameId));
      frameIds.clear();
      fallbackFrameTimers.forEach((timerId) => view.clearTimeout(timerId));
      fallbackFrameTimers.clear();
      signal?.removeEventListener("abort", abort);
    };
    const finish = (): void => {
      cleanup();
      resolve({ domChanged });
    };
    const abort = (): void => {
      cleanup();
      reject(new DOMException("Conversation scan aborted", "AbortError"));
    };
    const armQuietPeriod = (): void => {
      view.clearTimeout(quietTimer);
      quietTimer = view.setTimeout(finish, quietPeriodMs);
    };
    const observer = new MutationObserver(() => {
      domChanged = true;
      armQuietPeriod();
    });

    observer.observe(container, { childList: true, subtree: true });
    signal?.addEventListener("abort", abort, { once: true });
    timers.maximum = view.setTimeout(finish, maximumWaitMs);

    const requestFrame = (callback: () => void): void => {
      if (typeof view.requestAnimationFrame === "function") {
        const frameId = view.requestAnimationFrame(() => {
          frameIds.delete(frameId);
          callback();
        });
        frameIds.add(frameId);
      } else {
        const timer = view.setTimeout(() => {
          fallbackFrameTimers.delete(timer);
          callback();
        }, 16);
        fallbackFrameTimers.add(timer);
      }
    };
    requestFrame(() => requestFrame(armQuietPeriod));
  });
}

function setScrollPosition(element: HTMLElement, position: number): void {
  const top = Math.max(0, Math.round(position));
  try {
    element.scrollTo({ top, behavior: "auto" });
  } catch {
    element.scrollTop = top;
  }
}

export function createChatGPTConversationScanSource(scroller: HTMLElement): ConversationScanSource {
  return {
    getScrollPosition: () => scroller.scrollTop,
    getScrollHeight: () => scroller.scrollHeight,
    getViewportHeight: () => scroller.clientHeight,
    scrollTo: (position) => setScrollPosition(scroller, position),
    settle: (signal) => waitForChatGPTDomToSettle(scroller, signal),
    async restore(position) {
      setScrollPosition(scroller, position);
      try {
        await waitForChatGPTDomToSettle(scroller, undefined, {
          quietPeriodMs: 50,
          maximumWaitMs: 300,
        });
      } catch {
        // The scroll position was already restored; cleanup remains best-effort during teardown.
      }
    },
  };
}
