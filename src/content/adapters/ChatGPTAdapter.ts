import type { ExtractedResponse } from "../../shared/types";
import { sanitizeResponseHtml } from "../sanitize";
import type { ConversationAdapter } from "./ConversationAdapter";

const HOSTNAME = "chatgpt.com";

// These selectors intentionally favor message metadata and semantic turn attributes.
// ChatGPT's DOM is not a public API, so review them during every manual browser verification.
const ASSISTANT_CONTAINER_SELECTORS = [
  '[data-message-author-role="assistant"]',
  'article[data-turn="assistant"]',
];

const TURN_ARTICLE_SELECTOR = [
  'article[data-turn="assistant"]',
  'article[data-testid^="conversation-turn-"]',
].join(",");

// Fallback labels are intentionally restricted to plausible author-label positions.
// Avoid broad heading/aria-label queries because response controls also expose labels.
const FALLBACK_AUTHOR_LABEL_SELECTORS = [
  ":scope > h5",
  ":scope > h6",
  ":scope > header h5",
  ":scope > header h6",
  ":scope > div:first-child > h5",
  ":scope > div:first-child > h6",
  ':scope > [data-testid="conversation-turn-author"]',
].join(",");

const HOST_UI_SELECTORS = [
  "button",
  '[role="button"]',
  "nav",
  "form",
  "input",
  "textarea",
  "select",
  "svg",
  '[contenteditable="true"]',
  '[data-testid*="copy" i]',
  '[data-testid*="feedback" i]',
  '[data-testid*="action" i]',
  '[aria-label*="copy" i]',
  '[aria-label*="feedback" i]',
  '[aria-label*="read aloud" i]',
  '[aria-label*="audio" i]',
  '[aria-label*="menu" i]',
].join(",");

function simpleHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export class ChatGPTAdapter implements ConversationAdapter {
  readonly source = "chatgpt" as const;
  readonly capabilities = {
    configured: true,
    implemented: true,
    manuallyVerified: false,
    canExtractResponses: true,
  } as const;

  constructor(
    private readonly doc: Document = document,
    private readonly hostname: string = window.location.hostname,
  ) {}

  isSupportedPage(): boolean {
    return this.hostname === HOSTNAME || this.hostname.endsWith(`.${HOSTNAME}`);
  }

  getLatestAssistantResponse(): ExtractedResponse | null {
    if (!this.isSupportedPage()) {
      return null;
    }

    try {
      const candidates = this.getAssistantContainers();
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const response = this.extractResponse(candidates[index], index);
        if (response) {
          return response;
        }
      }
    } catch {
      // ChatGPT's DOM is not a public contract; extraction must fail safely.
    }
    return null;
  }

  hasLatestAssistantResponse(): boolean {
    if (!this.isSupportedPage()) {
      return false;
    }

    try {
      return this.getAssistantContainers().some((container) => {
        const contentRoot = this.findContentRoot(container);
        return Boolean(contentRoot.textContent?.trim());
      });
    } catch {
      return false;
    }
  }

  getAllAssistantResponses(): ExtractedResponse[] {
    if (!this.isSupportedPage()) {
      return [];
    }

    try {
      return this.getAssistantContainers()
        .map((container, index) => this.extractResponse(container, index))
        .filter((response): response is ExtractedResponse => response !== null);
    } catch {
      return [];
    }
  }

  observePageChanges(callback: () => void): () => void {
    const body = this.doc.body;
    if (!body) {
      return () => undefined;
    }

    let timeoutId: number | undefined;
    const schedule = (): void => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(callback, 180);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(body, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", schedule);
      window.clearTimeout(timeoutId);
    };
  }

  private getAssistantContainers(): Element[] {
    const rawCandidates: Element[] = [];

    // Collect every selector family because ChatGPT can temporarily render mixed turn shapes
    // during streaming, branching, or SPA transitions.
    for (const selector of ASSISTANT_CONTAINER_SELECTORS) {
      rawCandidates.push(...this.doc.querySelectorAll(selector));
    }

    // Last-resort fallback for current turn articles that expose only an author label.
    // English text is less resilient and may need localization-aware maintenance later.
    for (const article of this.doc.querySelectorAll('article[data-testid^="conversation-turn-"]')) {
      const labels = article.querySelectorAll(FALLBACK_AUTHOR_LABEL_SELECTORS);
      if (
        Array.from(labels).some((label) =>
          /^(chatgpt|assistant)(\s+said)?\s*:?$/i.test(label.textContent?.trim() ?? ""),
        )
      ) {
        rawCandidates.push(article);
      }
    }

    const identitySet = new Set<Element>();
    const canonicalCandidates: Element[] = [];
    for (const candidate of rawCandidates) {
      const canonical = this.canonicalizeCandidate(candidate);
      if (!identitySet.has(canonical)) {
        identitySet.add(canonical);
        canonicalCandidates.push(canonical);
      }
    }

    canonicalCandidates.sort((left, right) => {
      if (left === right) {
        return 0;
      }
      const position = left.compareDocumentPosition(right);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // Distinct DOM nodes can represent the same message during transitions. Keep the newest
    // occurrence for stable host identifiers, then restore actual document order.
    const seenStableIds = new Set<string>();
    const deduplicatedNewestFirst: Element[] = [];
    for (let index = canonicalCandidates.length - 1; index >= 0; index -= 1) {
      const candidate = canonicalCandidates[index];
      const stableId = this.getStableHostId(candidate);
      if (stableId && seenStableIds.has(stableId)) {
        continue;
      }
      if (stableId) {
        seenStableIds.add(stableId);
      }
      deduplicatedNewestFirst.push(candidate);
    }
    return deduplicatedNewestFirst.reverse();
  }

  private extractResponse(container: Element, index: number): ExtractedResponse | null {
    const clone = container.cloneNode(true) as Element;
    clone.querySelectorAll(HOST_UI_SELECTORS).forEach((element) => element.remove());

    // `.markdown` is a secondary content-boundary hint, not the assistant-turn selector.
    // If ChatGPT removes it, extraction safely falls back to the semantic container clone.
    const contentRoot = this.findContentRoot(clone);
    const { html, text } = sanitizeResponseHtml(contentRoot);
    if (!text) {
      return null;
    }

    const hostId = this.getStableHostId(container);

    return {
      id: hostId || `chatgpt-${index}-${simpleHash(text)}`,
      source: this.source,
      html,
      text,
      extractedAt: new Date().toISOString(),
    };
  }

  private findContentRoot(container: Element): Element {
    // The class-based hints are secondary boundaries inside a semantically identified turn.
    // They must never be used on their own to determine whether a turn belongs to the assistant.
    return (
      container.querySelector('[data-message-content], .markdown, [class*="prose"]') ?? container
    );
  }

  private getStableHostId(container: Element): string {
    return (
      container.getAttribute("data-message-id") ??
      container.querySelector("[data-message-id]")?.getAttribute("data-message-id") ??
      container.getAttribute("data-testid") ??
      container.id
    );
  }

  private canonicalizeCandidate(candidate: Element): Element {
    // Prefer the outer turn article even when an inner message node also has a stable ID.
    // This prevents one response from being represented by both its turn and content wrapper.
    return (
      candidate.closest(TURN_ARTICLE_SELECTOR) ??
      candidate.closest("[data-message-id]") ??
      candidate
    );
  }
}
