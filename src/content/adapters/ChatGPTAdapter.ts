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

  constructor(
    private readonly doc: Document = document,
    private readonly hostname: string = window.location.hostname,
  ) {}

  isSupportedPage(): boolean {
    return this.hostname === HOSTNAME || this.hostname.endsWith(`.${HOSTNAME}`);
  }

  getLatestAssistantResponse(): ExtractedResponse | null {
    const responses = this.getAllAssistantResponses();
    return responses.at(-1) ?? null;
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
    // Use the first viable selector family to avoid extracting both a turn and its nested content.
    for (const selector of ASSISTANT_CONTAINER_SELECTORS) {
      const matches = Array.from(this.doc.querySelectorAll(selector));
      if (matches.length > 0) {
        return matches;
      }
    }

    // Last-resort semantic fallback for turn articles that expose the author only as a label.
    // The English label can vary with localization, so it is deliberately less preferred.
    return Array.from(
      this.doc.querySelectorAll('article[data-testid^="conversation-turn-"]'),
    ).filter((article) => {
      if (article.querySelector('[data-message-author-role="assistant"]')) {
        return true;
      }
      const authorLabel = article.querySelector("h5, h6, [aria-label]");
      const label =
        authorLabel?.getAttribute("aria-label") ?? authorLabel?.textContent?.trim() ?? "";
      return /^(chatgpt|assistant)(\s+said)?\s*:?$/i.test(label);
    });
  }

  private extractResponse(container: Element, index: number): ExtractedResponse | null {
    const clone = container.cloneNode(true) as Element;
    clone.querySelectorAll(HOST_UI_SELECTORS).forEach((element) => element.remove());

    // `.markdown` is a secondary content-boundary hint, not the assistant-turn selector.
    // If ChatGPT removes it, extraction safely falls back to the semantic container clone.
    const contentRoot =
      clone.querySelector('[data-message-content], .markdown, [class*="prose"]') ?? clone;
    const { html, text } = sanitizeResponseHtml(contentRoot);
    if (!text) {
      return null;
    }

    const hostId =
      container.getAttribute("data-message-id") ??
      container.getAttribute("data-testid") ??
      container.id;

    return {
      id: hostId || `chatgpt-${index}-${simpleHash(text)}`,
      source: this.source,
      html,
      text,
      extractedAt: new Date().toISOString(),
    };
  }
}
