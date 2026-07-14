import type {
  ConversationDocument,
  ConversationRole,
  ConversationTurn,
  DocumentContentBlock,
  ExtractedResponse,
} from "../../shared/types";
import { assistantBlocks, toExtractedResponse } from "../../shared/types";
import { sanitizeResponseHtml } from "../sanitize";
import type { ConversationAdapter } from "./ConversationAdapter";

const HOSTNAME = "chatgpt.com";

// Prefer message metadata and semantic turn attributes. ChatGPT's DOM is private, so these
// selectors still require live review even though generated presentation classes are avoided.
const ROLE_CONTAINER_SELECTORS: Record<ConversationRole, readonly string[]> = {
  assistant: ['[data-message-author-role="assistant"]', 'article[data-turn="assistant"]'],
  user: ['[data-message-author-role="user"]', 'article[data-turn="user"]'],
};

const TURN_ARTICLE_SELECTOR = [
  "article[data-turn]",
  'article[data-testid^="conversation-turn-"]',
].join(",");

const FALLBACK_AUTHOR_LABEL_SELECTORS = [
  ":scope > h5",
  ":scope > h6",
  ":scope > header h5",
  ":scope > header h6",
  ":scope > div:first-child > h5",
  ":scope > div:first-child > h6",
  ':scope > [data-testid="conversation-turn-author"]',
].join(",");
const AUTHOR_LABELS: Record<ConversationRole, RegExp> = {
  assistant: /^(chatgpt|assistant)(\s+said)?\s*:?$/i,
  user: /^(you|user)(\s+said)?\s*:?$/i,
};

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

interface MessageCandidate {
  element: Element;
  role: ConversationRole;
}

function simpleHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function pairBlocksIntoTurns(blocks: readonly DocumentContentBlock[]): ConversationTurn[] {
  const paired: Array<{
    prompt: DocumentContentBlock | null;
    response: DocumentContentBlock | null;
  }> = [];
  let current: {
    prompt: DocumentContentBlock | null;
    response: DocumentContentBlock | null;
  } | null = null;

  for (const block of blocks) {
    if (block.role === "user") {
      if (current && (current.prompt || current.response)) {
        paired.push(current);
      }
      current = { prompt: block, response: null };
      continue;
    }

    if (!current) {
      current = { prompt: null, response: null };
    } else if (current.response) {
      paired.push(current);
      current = { prompt: null, response: null };
    }
    current.response = block;
  }

  if (current && (current.prompt || current.response)) {
    paired.push(current);
  }

  return paired.map((turn, index) => ({
    id: `turn-${index}-${turn.prompt?.id ?? "missing-prompt"}-${turn.response?.id ?? "missing-response"}`,
    index,
    prompt: turn.prompt,
    response: turn.response,
  }));
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
    private readonly currentUrl?: string,
  ) {}

  isSupportedPage(): boolean {
    return this.hostname === HOSTNAME || this.hostname.endsWith(`.${HOSTNAME}`);
  }

  getConversationDocument(): ConversationDocument | null {
    if (!this.isSupportedPage()) {
      return null;
    }

    try {
      const sourceUrl = this.currentUrl ?? this.doc.location?.href ?? window.location.href;
      const sourceConversationId = this.getSourceConversationId(sourceUrl);
      const extractedAt = new Date().toISOString();
      const blocks: DocumentContentBlock[] = [];

      this.getMessageCandidates().forEach((candidate, index) => {
        try {
          const block = this.extractBlock(
            candidate.element,
            candidate.role,
            index,
            sourceUrl,
            sourceConversationId,
            extractedAt,
          );
          if (block) {
            blocks.push(block);
          }
        } catch {
          // Streaming or stale message nodes are skipped without losing stable neighboring turns.
        }
      });

      if (blocks.length === 0) {
        return null;
      }

      return {
        id: sourceConversationId
          ? `chatgpt-${sourceConversationId}`
          : `chatgpt-document-${simpleHash(sourceUrl)}`,
        source: this.source,
        title: this.getSafeTitle(),
        sourceUrl,
        extractedAt,
        turns: pairBlocksIntoTurns(blocks),
      };
    } catch {
      return null;
    }
  }

  getLatestAssistantResponse(): ExtractedResponse | null {
    const conversation = this.getConversationDocument();
    return conversation
      ? (assistantBlocks(conversation).map(toExtractedResponse).at(-1) ?? null)
      : null;
  }

  hasLatestAssistantResponse(): boolean {
    if (!this.isSupportedPage()) {
      return false;
    }

    try {
      for (const selector of ROLE_CONTAINER_SELECTORS.assistant) {
        if (this.doc.querySelector(selector)) {
          return true;
        }
      }

      return Array.from(
        this.doc.querySelectorAll('article[data-testid^="conversation-turn-"]'),
      ).some((article) =>
        Array.from(article.querySelectorAll(FALLBACK_AUTHOR_LABEL_SELECTORS)).some((label) =>
          AUTHOR_LABELS.assistant.test(label.textContent?.trim() ?? ""),
        ),
      );
    } catch {
      return false;
    }
  }

  getAllAssistantResponses(): ExtractedResponse[] {
    const conversation = this.getConversationDocument();
    return conversation ? assistantBlocks(conversation).map(toExtractedResponse) : [];
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

  private getMessageCandidates(): MessageCandidate[] {
    const raw: MessageCandidate[] = [];
    for (const role of ["user", "assistant"] as const) {
      for (const selector of ROLE_CONTAINER_SELECTORS[role]) {
        this.doc.querySelectorAll(selector).forEach((element) => raw.push({ element, role }));
      }
    }

    for (const article of this.doc.querySelectorAll('article[data-testid^="conversation-turn-"]')) {
      const labels = Array.from(article.querySelectorAll(FALLBACK_AUTHOR_LABEL_SELECTORS));
      for (const role of ["user", "assistant"] as const) {
        if (labels.some((label) => AUTHOR_LABELS[role].test(label.textContent?.trim() ?? ""))) {
          raw.push({ element: article, role });
          break;
        }
      }
    }

    const byElement = new Map<Element, MessageCandidate>();
    for (const candidate of raw) {
      const canonical = this.canonicalizeCandidate(candidate.element);
      if (!byElement.has(canonical)) {
        byElement.set(canonical, { element: canonical, role: candidate.role });
      }
    }

    const ordered = Array.from(byElement.values()).sort((left, right) => {
      if (left.element === right.element) {
        return 0;
      }
      const position = left.element.compareDocumentPosition(right.element);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    // During SPA transitions the same host message can exist twice. Retain its newest node.
    const seen = new Set<string>();
    const newestFirst: MessageCandidate[] = [];
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const candidate = ordered[index];
      const hostId = this.getStableHostId(candidate.element);
      const dedupeKey = hostId ? `${candidate.role}:${hostId}` : "";
      if (dedupeKey && seen.has(dedupeKey)) {
        continue;
      }
      if (dedupeKey) {
        seen.add(dedupeKey);
      }
      newestFirst.push(candidate);
    }
    return newestFirst.reverse();
  }

  private extractBlock(
    container: Element,
    role: ConversationRole,
    index: number,
    sourceUrl: string,
    sourceConversationId: string | undefined,
    extractedAt: string,
  ): DocumentContentBlock | null {
    const clone = container.cloneNode(true) as Element;
    this.pruneHostOnlyContent(clone);
    const contentRoot = this.findContentRoot(clone);
    const sourceMessageId = this.getStableHostId(container) || undefined;
    const fallbackSeed = (contentRoot.textContent ?? "").replace(/\s+/g, " ").trim();
    const id = sourceMessageId || `chatgpt-${role}-${index}-${simpleHash(fallbackSeed)}`;
    const { html, text } = sanitizeResponseHtml(contentRoot, id);
    if (!text) {
      return null;
    }

    return {
      id,
      role,
      html,
      text,
      provenance: {
        kind: "original",
        platform: this.source,
        sourceUrl,
        ...(sourceConversationId ? { sourceConversationId } : {}),
        ...(sourceMessageId ? { sourceMessageId } : {}),
        extractedAt,
        contentFingerprint: `djb2-${simpleHash(`${role}\n${html}\n${text}`)}`,
      },
    };
  }

  private findContentRoot(container: Element): Element {
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
    return (
      candidate.closest(TURN_ARTICLE_SELECTOR) ??
      candidate.closest("[data-message-id]") ??
      candidate
    );
  }

  private pruneHostOnlyContent(container: Element): void {
    container.querySelectorAll(HOST_UI_SELECTORS).forEach((element) => element.remove());
    container.querySelectorAll(FALLBACK_AUTHOR_LABEL_SELECTORS).forEach((label) => {
      if (
        AUTHOR_LABELS.user.test(label.textContent?.trim() ?? "") ||
        AUTHOR_LABELS.assistant.test(label.textContent?.trim() ?? "")
      ) {
        label.remove();
      }
    });
  }

  private getSourceConversationId(sourceUrl: string): string | undefined {
    try {
      const match = new URL(sourceUrl).pathname.match(/^\/c\/([^/?#]+)/);
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    } catch {
      return undefined;
    }
  }

  private getSafeTitle(): string | null {
    const title = this.doc.title
      .trim()
      .replace(/\s*[|—-]\s*ChatGPT\s*$/i, "")
      .trim();
    if (!title || /^(chatgpt|new chat)$/i.test(title) || title.length > 200) {
      return null;
    }
    return title;
  }
}
