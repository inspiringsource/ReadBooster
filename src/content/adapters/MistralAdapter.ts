import { pairContentBlocksIntoTurns } from "../../shared/conversation";
import {
  recordConversationPipelineDiagnostics,
  resetConversationPipelineDiagnostics,
} from "../../shared/developmentDiagnostics";
import type {
  ConversationDocument,
  ConversationRole,
  ConversationScanOptions,
  ConversationScanResult,
  DocumentContentBlock,
  ExtractedResponse,
} from "../../shared/types";
import { assistantBlocks, toExtractedResponse } from "../../shared/types";
import { scanConversationSource } from "../conversationSourceScanner";
import {
  isKnownFaviconSource,
  isSafeImageSource,
  normalizeSupportedCodeLanguageLabel,
  sanitizeResponseHtml,
} from "../sanitize";
import type { ConversationAdapter } from "./ConversationAdapter";
import {
  createMistralConversationScanSource,
  findMistralConversationScroller,
} from "./mistralSourceScanner";

const HOSTNAME = "chat.mistral.ai";

// Current Mistral conversations expose stable role/message boundaries. Content-part selectors are
// intentionally separate: an answer or Canvas belongs to one assistant message, while reasoning
// is host-only material and must never become an independent response.
const PRIMARY_ROLE_CONTAINER_SELECTORS: Record<ConversationRole, string> = {
  user: '[data-message-author-role="user"][data-message-id]',
  assistant: '[data-message-author-role="assistant"][data-message-id]',
};

const ROLE_CONTAINER_SELECTORS: Record<ConversationRole, readonly string[]> = {
  user: [
    PRIMARY_ROLE_CONTAINER_SELECTORS.user,
    '[data-message-author-role="user"]',
    '[data-message-role="user"]',
    '[data-role="user"][data-message-id]',
    'article[data-role="user"]',
    '[data-testid="user-message"]',
  ],
  assistant: [
    PRIMARY_ROLE_CONTAINER_SELECTORS.assistant,
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="model"]',
    '[data-message-role="assistant"]',
    '[data-message-role="model"]',
    '[data-role="assistant"][data-message-id]',
    '[data-role="model"][data-message-id]',
    'article[data-role="assistant"]',
    'article[data-role="model"]',
    '[data-testid="assistant-message"]',
    '[data-testid="model-message"]',
    '[data-message-part-type="answer"]',
    '[data-testid="text-message-part"]',
  ],
};

const ALL_ROLE_SELECTOR = [
  ...ROLE_CONTAINER_SELECTORS.user,
  ...ROLE_CONTAINER_SELECTORS.assistant,
].join(",");

const ASSISTANT_ANSWER_SELECTOR =
  '[data-message-part-type="answer"][data-testid="text-message-part"]';
const ANSWER_PART_SELECTOR = '[data-message-part-type="answer"]';
const REASONING_PART_SELECTOR = '[data-message-part-type="reasoning"]';
const TEXT_MESSAGE_PART_SELECTOR =
  '[data-testid="text-message-part"]:not([data-message-part-type="reasoning"])';
const CONTENT_ROOT_SELECTORS = [
  '[data-testid="message-content"]',
  "[data-message-content]",
  '[data-testid="assistant-message-content"]',
  '[data-testid="user-message-content"]',
  '[data-testid="response-content"]',
  ".markdown",
  ".prose",
].join(",");

const CONVERSATION_ROOT_SELECTORS = [
  '[data-testid="conversation"]',
  '[data-testid="conversation-thread"]',
  "[data-conversation-id]",
  "[data-chat-id]",
  'main[role="main"]',
  "main",
];

const INACTIVE_SELECTOR = [
  "[hidden]",
  '[aria-hidden="true"]',
  "[inert]",
  '[data-active="false"]',
  '[data-selected="false"]',
].join(",");

const HOST_UI_SELECTORS = [
  "button",
  '[role="button"]',
  "nav",
  "form",
  "input",
  "textarea",
  "select",
  "audio",
  "time",
  "svg",
  '[role="menu"]',
  '[role="toolbar"]',
  '[contenteditable="true"]',
  '[data-testid*="actions" i]',
  '[data-testid*="timestamp" i]',
  '[data-testid*="copy" i]',
  '[data-testid*="feedback" i]',
  '[data-testid*="share" i]',
  '[data-testid*="regenerate" i]',
  '[data-testid*="retry" i]',
  '[aria-label*="copy" i]',
  '[aria-label*="feedback" i]',
  '[aria-label*="share" i]',
  '[aria-label*="regenerate" i]',
  '[aria-label*="retry" i]',
  '[aria-label*="edit" i]',
  '[aria-label*="read aloud" i]',
  '[aria-label*="audio" i]',
  '[aria-label*="menu" i]',
].join(",");

const CODE_LANGUAGE_SELECTORS = [
  "[data-code-language]",
  "[data-language]",
  '[data-testid*="language" i]',
  '[data-testid*="code-header" i]',
  '[class*="language-label" i]',
  '[class*="code-header" i]',
].join(",");

const CITATION_CONTEXT_SELECTOR = [
  '[data-testid*="citation" i]',
  '[data-testid*="source" i]',
  '[data-testid*="reference" i]',
  '[role="doc-biblioref"]',
  "[data-citation]",
  "[data-reference-id]",
].join(",");

const ATTACHMENT_CONTEXT_SELECTOR = [
  "[data-file-name]",
  "[data-filename]",
  '[data-testid*="attachment" i]',
  '[data-testid*="file-reference" i]',
].join(",");

const EXCLUDED_IMAGE_CONTEXT_SELECTOR = [
  CITATION_CONTEXT_SELECTOR,
  "button",
  '[role="button"]',
  "nav",
  '[role="menu"]',
  '[role="toolbar"]',
  '[data-testid*="avatar" i]',
  '[data-testid*="logo" i]',
  '[data-testid*="source" i]',
  '[data-testid*="citation" i]',
  '[aria-label*="avatar" i]',
  '[aria-label*="icon" i]',
].join(",");

const VISUAL_CONTEXT_SELECTOR = [
  "figure",
  '[data-content-image="true"]',
  '[data-testid*="generated-image" i]',
  '[data-testid*="response-image" i]',
  '[data-testid*="image-result" i]',
].join(",");

const SOURCE_MESSAGE_ID_ATTRIBUTES: Record<ConversationRole, readonly string[]> = {
  user: ["data-message-id", "data-request-id", "data-turn-id"],
  assistant: ["data-message-id", "data-response-id", "data-turn-id"],
};

const CANVAS_BOUNDARY_SELECTOR = '[data-message-quote-boundary="canvas"]';
const CANVAS_EDITOR_SELECTOR = ".tiptap.ProseMirror.markdown-editor";
const CANVAS_SELECTOR = `${CANVAS_BOUNDARY_SELECTOR} ${CANVAS_EDITOR_SELECTOR}`;
const RICH_TABLE_SELECTOR = "[data-rich-table-inner-html]";

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

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function validStableId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized &&
    normalized.length <= 512 &&
    Array.from(normalized).every((character) => character.charCodeAt(0) >= 32)
    ? normalized
    : undefined;
}

export class MistralAdapter implements ConversationAdapter {
  readonly source = "mistral" as const;
  readonly capabilities = {
    configured: true,
    implemented: true,
    manuallyVerified: false,
    canExtractResponses: true,
  } as const;

  private scanInFlight: Promise<ConversationScanResult> | null = null;
  private readonly fallbackMessageIds = new WeakMap<Element, string>();
  private fallbackMessageCounter = 0;

  constructor(
    private readonly doc: Document = document,
    private readonly hostname: string = window.location.hostname,
    private readonly currentUrl?: string,
  ) {}

  isSupportedPage(): boolean {
    if (this.hostname.toLowerCase().replace(/\.$/, "") !== HOSTNAME) {
      return false;
    }
    try {
      return /^\/(?:chat|work)(?:\/|$)/.test(new URL(this.pageUrl()).pathname);
    } catch {
      return false;
    }
  }

  shouldInjectControl(): boolean {
    return this.isSupportedPage() && this.hasLatestAssistantResponse();
  }

  hasLatestAssistantResponse(): boolean {
    if (!this.isSupportedPage()) {
      return false;
    }
    try {
      return this.getRoleCandidates("assistant").some((candidate) => {
        if (!this.isActiveCandidate(candidate) || this.isCanvasCandidate(candidate)) {
          return false;
        }
        const root = this.findContentRoot(candidate, "assistant");
        if (!root) {
          return false;
        }
        return Boolean(
          normalizedText(root.textContent) || root.querySelector("img, figure, pre, table"),
        );
      });
    } catch {
      return false;
    }
  }

  getConversationDocument(): ConversationDocument | null {
    if (import.meta.env.DEV) {
      resetConversationPipelineDiagnostics();
    }
    if (!this.isSupportedPage()) {
      return null;
    }

    try {
      const sourceUrl = this.pageUrl();
      const sourceConversationId = this.getSourceConversationId(sourceUrl);
      const extractedAt = new Date().toISOString();
      const blocks: DocumentContentBlock[] = [];

      this.getMessageCandidates().forEach((candidate) => {
        try {
          const block = this.extractBlock(
            candidate.element,
            candidate.role,
            sourceUrl,
            sourceConversationId,
            extractedAt,
          );
          if (block) {
            blocks.push(block);
          }
        } catch {
          // A malformed, stale, or streaming candidate cannot discard neighboring messages.
        }
      });

      const turns = pairContentBlocksIntoTurns(blocks);
      if (!turns.some((turn) => turn.response)) {
        return null;
      }
      if (import.meta.env.DEV) {
        recordConversationPipelineDiagnostics({
          extractedAssistantBlocks: blocks.filter((block) => block.role === "assistant").length,
          normalizedTurns: turns.length,
        });
      }

      return {
        id: sourceConversationId
          ? `mistral-${sourceConversationId}`
          : `mistral-document-${simpleHash(sourceUrl)}`,
        source: this.source,
        title: this.getSafeTitle(),
        sourceUrl,
        extractedAt,
        turns,
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

  getAllAssistantResponses(): ExtractedResponse[] {
    const conversation = this.getConversationDocument();
    return conversation ? assistantBlocks(conversation).map(toExtractedResponse) : [];
  }

  scanConversationDocument(options: ConversationScanOptions = {}): Promise<ConversationScanResult> {
    if (this.scanInFlight) {
      return this.scanInFlight;
    }
    const operation = this.performConversationScan(options);
    this.scanInFlight = operation;
    const clear = (): void => {
      if (this.scanInFlight === operation) {
        this.scanInFlight = null;
      }
    };
    void operation.then(clear, clear);
    return operation;
  }

  observePageChanges(callback: () => void): () => void {
    // Observe the application body so a client-side navigation that replaces the entire
    // conversation root still re-evaluates eligibility. Child-list observation plus debouncing
    // avoids reparsing on every streamed text mutation.
    const root = this.doc.body;
    if (!root) {
      return () => undefined;
    }

    const view = this.doc.defaultView ?? window;
    let timeoutId: number | undefined;
    const schedule = (): void => {
      view.clearTimeout(timeoutId);
      timeoutId = view.setTimeout(callback, 180);
    };
    const observer = new MutationObserver((records) => {
      const onlyReadBoosterChanges = records.every((record) =>
        [...record.addedNodes, ...record.removedNodes].every(
          (node) =>
            node instanceof Element &&
            (node.id === "readbooster-control-root" || node.id === "readbooster-reader-root"),
        ),
      );
      if (!onlyReadBoosterChanges) {
        schedule();
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    view.addEventListener("popstate", schedule);
    view.addEventListener("hashchange", schedule);

    return () => {
      observer.disconnect();
      view.removeEventListener("popstate", schedule);
      view.removeEventListener("hashchange", schedule);
      view.clearTimeout(timeoutId);
    };
  }

  private async performConversationScan(
    options: ConversationScanOptions,
  ): Promise<ConversationScanResult> {
    const initialDocument = this.getConversationDocument();
    if (!initialDocument) {
      return {
        document: null,
        scanPerformed: false,
        completed: false,
        terminationReason: "failed",
      };
    }
    if (options.signal?.aborted) {
      return {
        document: initialDocument,
        scanPerformed: false,
        completed: false,
        terminationReason: "aborted",
      };
    }

    const candidates = this.getMessageCandidates().map((candidate) => candidate.element);
    const scroller = findMistralConversationScroller(this.doc, candidates);
    if (!scroller) {
      return {
        document: initialDocument,
        scanPerformed: false,
        completed: false,
        terminationReason: "single-snapshot",
      };
    }

    try {
      return await scanConversationSource({
        initialDocument,
        source: createMistralConversationScanSource(scroller),
        captureSnapshot: () => this.getConversationDocument(),
        signal: options.signal,
        onProgress: options.onProgress,
      });
    } catch {
      return {
        document: initialDocument,
        scanPerformed: true,
        completed: false,
        terminationReason: options.signal?.aborted ? "aborted" : "failed",
      };
    }
  }

  private pageUrl(): string {
    return this.currentUrl ?? this.doc.location?.href ?? window.location.href;
  }

  private findConversationRoot(): Element | null {
    for (const selector of CONVERSATION_ROOT_SELECTORS) {
      const roots = Array.from(this.doc.querySelectorAll(selector));
      const rootWithMessages = roots.find((root) => root.querySelector(ALL_ROLE_SELECTOR));
      if (rootWithMessages) {
        return rootWithMessages;
      }
    }
    return null;
  }

  private getRoleCandidates(role: ConversationRole): Element[] {
    const root = this.findConversationRoot() ?? this.doc;
    const candidates: Element[] = [];
    for (const selector of ROLE_CONTAINER_SELECTORS[role]) {
      root.querySelectorAll(selector).forEach((element) => candidates.push(element));
      if (root instanceof Element && root.matches(selector)) {
        candidates.push(root);
      }
    }
    return candidates;
  }

  private getMessageCandidates(): MessageCandidate[] {
    const raw: MessageCandidate[] = [];
    for (const role of ["user", "assistant"] as const) {
      this.getRoleCandidates(role).forEach((element) => raw.push({ element, role }));
    }
    if (import.meta.env.DEV) {
      recordConversationPipelineDiagnostics({
        rawAssistantCandidates: raw.filter((candidate) => candidate.role === "assistant").length,
        rawUserCandidates: raw.filter((candidate) => candidate.role === "user").length,
      });
    }

    const byElement = new Map<Element, MessageCandidate>();
    for (const candidate of raw) {
      const canonical = this.canonicalizeCandidate(candidate.element, candidate.role);
      if (
        this.isActiveCandidate(canonical) &&
        !this.isCanvasCandidate(canonical) &&
        !byElement.has(canonical)
      ) {
        byElement.set(canonical, { element: canonical, role: candidate.role });
      }
    }
    const canonicalCandidates = Array.from(byElement.values());
    if (import.meta.env.DEV) {
      recordConversationPipelineDiagnostics({ canonicalCandidates: canonicalCandidates.length });
    }

    const individual = canonicalCandidates.filter(
      (candidate) =>
        !canonicalCandidates.some(
          (other) =>
            other !== candidate &&
            other.role === candidate.role &&
            candidate.element.contains(other.element),
        ),
    );
    const ordered = individual.sort((left, right) => {
      if (left.element === right.element) {
        return 0;
      }
      const position = left.element.compareDocumentPosition(right.element);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    const seen = new Set<string>();
    const newestFirst: MessageCandidate[] = [];
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const candidate = ordered[index];
      const hostId = this.getReliableMessageId(candidate.element, candidate.role);
      const key = hostId ? `${candidate.role}:${hostId}` : "";
      if (key && seen.has(key)) {
        continue;
      }
      if (key) {
        seen.add(key);
      }
      newestFirst.push(candidate);
    }
    const deduplicated = newestFirst.reverse();
    if (import.meta.env.DEV) {
      recordConversationPipelineDiagnostics({ deduplicatedCandidates: deduplicated.length });
    }
    return deduplicated;
  }

  private canonicalizeCandidate(candidate: Element, role: ConversationRole): Element {
    const primaryBoundary = candidate.closest(PRIMARY_ROLE_CONTAINER_SELECTORS[role]);
    if (primaryBoundary) {
      return primaryBoundary;
    }
    const selector = ROLE_CONTAINER_SELECTORS[role].join(",");
    return candidate.matches(selector) ? candidate : (candidate.closest(selector) ?? candidate);
  }

  private isActiveCandidate(candidate: Element): boolean {
    if (candidate.matches(INACTIVE_SELECTOR) || candidate.closest(INACTIVE_SELECTOR)) {
      return false;
    }
    const view = this.doc.defaultView;
    if (!view) {
      return true;
    }
    try {
      const style = view.getComputedStyle(candidate);
      return style.display !== "none" && style.visibility !== "hidden";
    } catch {
      return true;
    }
  }

  private isCanvasCandidate(candidate: Element): boolean {
    return (
      candidate.matches(CANVAS_EDITOR_SELECTOR) ||
      Boolean(candidate.closest(CANVAS_EDITOR_SELECTOR))
    );
  }

  private findSelfOrDescendant(container: Element, selector: string): Element | null {
    return container.matches(selector) ? container : container.querySelector(selector);
  }

  private findContentRoot(container: Element, role: ConversationRole): Element | null {
    if (role === "assistant") {
      // Canvas is the complete user-facing document for this response. Prefer it to the short
      // adjacent answer acknowledgement, but only when it is bounded by the assistant message.
      const canvas = this.findSelfOrDescendant(container, CANVAS_SELECTOR);
      if (canvas) {
        return canvas;
      }
      for (const selector of [
        ASSISTANT_ANSWER_SELECTOR,
        ANSWER_PART_SELECTOR,
        TEXT_MESSAGE_PART_SELECTOR,
      ]) {
        const answer = this.findSelfOrDescendant(container, selector);
        if (answer) {
          return answer;
        }
      }
      if (
        container.matches(REASONING_PART_SELECTOR) ||
        container.matches(PRIMARY_ROLE_CONTAINER_SELECTORS.assistant)
      ) {
        return null;
      }
    }
    return this.findSelfOrDescendant(container, CONTENT_ROOT_SELECTORS) ?? container;
  }

  private extractBlock(
    container: Element,
    role: ConversationRole,
    sourceUrl: string,
    sourceConversationId: string | undefined,
    extractedAt: string,
  ): DocumentContentBlock | null {
    if (this.isCanvasCandidate(container)) {
      return null;
    }
    const sourceRoot = this.findContentRoot(container, role);
    if (!sourceRoot) {
      return null;
    }
    const contentRoot = sourceRoot.cloneNode(true) as Element;
    contentRoot.querySelectorAll(INACTIVE_SELECTOR).forEach((element) => element.remove());
    contentRoot.querySelectorAll(REASONING_PART_SELECTOR).forEach((element) => element.remove());
    this.normalizeMistralTables(contentRoot);
    this.preserveHostCodeLanguages(contentRoot);
    this.normalizeCitations(contentRoot, sourceUrl);
    this.normalizeAttachments(contentRoot);
    this.pruneImages(contentRoot);
    contentRoot.querySelectorAll(HOST_UI_SELECTORS).forEach((element) => element.remove());

    const sourceMessageId = this.getReliableMessageId(container, role) || undefined;
    const id = sourceMessageId || this.getSessionFallbackMessageId(container, role);
    const normalizedRoot = this.doc.createElement("div");
    normalizedRoot.append(contentRoot);
    const { html, text } = sanitizeResponseHtml(normalizedRoot, id);
    // Qualified images always carry meaningful alternative text, so media-only responses remain
    // eligible through the shared semantic text serializer without reparsing sanitized markup.
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

  private getReliableMessageId(container: Element, role: ConversationRole): string {
    for (const attribute of SOURCE_MESSAGE_ID_ATTRIBUTES[role]) {
      const value = validStableId(container.getAttribute(attribute));
      if (value) {
        return value;
      }
    }
    for (const attribute of SOURCE_MESSAGE_ID_ATTRIBUTES[role]) {
      const values = new Set(
        Array.from(container.querySelectorAll(`[${attribute}]`), (element) =>
          validStableId(element.getAttribute(attribute)),
        ).filter((value): value is string => Boolean(value)),
      );
      if (values.size === 1) {
        return values.values().next().value ?? "";
      }
    }
    for (const attribute of SOURCE_MESSAGE_ID_ATTRIBUTES[role]) {
      const ancestor = container.closest(`[${attribute}]`);
      const value = validStableId(ancestor?.getAttribute(attribute));
      if (
        value &&
        (ancestor === container ||
          ancestor?.querySelectorAll(ROLE_CONTAINER_SELECTORS[role].join(",")).length === 1)
      ) {
        return value;
      }
    }
    return "";
  }

  private getSessionFallbackMessageId(container: Element, role: ConversationRole): string {
    const existing = this.fallbackMessageIds.get(container);
    if (existing) {
      return existing;
    }
    // No source ID means there is no trustworthy cross-session identity. Keep a stable identity
    // only for this adapter session and this exact DOM node. This deliberately avoids using
    // response text, markup, position, or a generic test ID to collapse uncertain messages.
    this.fallbackMessageCounter += 1;
    const id = `mistral-${role}-session-${this.fallbackMessageCounter}`;
    this.fallbackMessageIds.set(container, id);
    return id;
  }

  private normalizeMistralTables(root: Element): void {
    this.normalizeRichTables(root);
    const roleTables = [
      ...(root.matches('[role="table"]') ? [root as HTMLElement] : []),
      ...Array.from(root.querySelectorAll<HTMLElement>('[role="table"]')),
    ];
    for (const grid of roleTables) {
      if (grid.tagName === "TABLE" || grid.closest("table")) {
        continue;
      }
      const table = this.reconstructRoleTable(grid);
      if (table) {
        if (grid === root) {
          grid.replaceChildren(table);
          grid.removeAttribute("role");
        } else {
          grid.replaceWith(table);
        }
      }
    }
  }

  private normalizeRichTables(root: Element): void {
    const candidates = [
      ...(root.matches(RICH_TABLE_SELECTOR) ? [root] : []),
      ...Array.from(root.querySelectorAll(RICH_TABLE_SELECTOR)),
    ];
    candidates.forEach((candidate, index) => {
      const encodedTable = candidate.getAttribute("data-rich-table-inner-html")?.trim();
      if (!encodedTable) {
        return;
      }
      try {
        // getAttribute() has already decoded the attribute's HTML entities. Parse it as an inert
        // document, then run the shared sanitizer before importing one semantic table back into
        // the cloned response.
        const parser = new DOMParser();
        const decodedDocument = parser.parseFromString(encodedTable, "text/html");
        const staging = this.doc.createElement("div");
        for (const child of Array.from(decodedDocument.body.childNodes)) {
          staging.append(this.doc.importNode(child, true));
        }
        const sanitized = sanitizeResponseHtml(staging, `mistral-rich-table-${index}`);
        const sanitizedDocument = parser.parseFromString(sanitized.html, "text/html");
        const tables = sanitizedDocument.body.querySelectorAll("table");
        if (tables.length === 1) {
          const table = this.doc.importNode(tables[0], true);
          if (candidate === root) {
            candidate.replaceChildren(table);
            candidate.removeAttribute("data-rich-table-inner-html");
            candidate.removeAttribute("role");
          } else {
            candidate.replaceWith(table);
          }
        }
      } catch {
        // Leave the visible role-based representation in place for the conservative fallback.
      }
    });
  }

  private reconstructRoleTable(grid: HTMLElement): HTMLTableElement | null {
    const rows = Array.from(grid.querySelectorAll<HTMLElement>('[role="row"]')).filter(
      (row) => row.closest('[role="table"]') === grid,
    );
    if (rows.length > 0) {
      const table = this.doc.createElement("table");
      const head = this.doc.createElement("thead");
      const body = this.doc.createElement("tbody");
      for (const sourceRow of rows) {
        const sourceCells = Array.from(
          sourceRow.querySelectorAll<HTMLElement>(
            ':scope > [role="columnheader"], :scope > [role="rowheader"], :scope > [role="cell"]',
          ),
        );
        if (sourceCells.length === 0) {
          continue;
        }
        const row = this.createSemanticTableRow(sourceCells);
        const isHeaderRow = sourceCells.every(
          (cell) => cell.getAttribute("role") === "columnheader",
        );
        (isHeaderRow ? head : body).append(row);
      }
      if (head.childElementCount > 0) {
        table.append(head);
      }
      if (body.childElementCount > 0) {
        table.append(body);
      }
      return table.querySelector("th, td") ? table : null;
    }

    const headers = Array.from(grid.querySelectorAll<HTMLElement>('[role="columnheader"]')).filter(
      (cell) => cell.closest('[role="table"]') === grid && !cell.closest('[role="row"]'),
    );
    const cells = Array.from(grid.querySelectorAll<HTMLElement>('[role="cell"]')).filter(
      (cell) => cell.closest('[role="table"]') === grid && !cell.closest('[role="row"]'),
    );
    if (headers.length === 0 || cells.length === 0 || cells.length % headers.length !== 0) {
      return null;
    }

    const table = this.doc.createElement("table");
    const head = this.doc.createElement("thead");
    head.append(this.createSemanticTableRow(headers));
    table.append(head);
    const body = this.doc.createElement("tbody");
    for (let offset = 0; offset < cells.length; offset += headers.length) {
      body.append(this.createSemanticTableRow(cells.slice(offset, offset + headers.length)));
    }
    table.append(body);
    return table;
  }

  private createSemanticTableRow(sourceCells: HTMLElement[]): HTMLTableRowElement {
    const row = this.doc.createElement("tr");
    for (const sourceCell of sourceCells) {
      const role = sourceCell.getAttribute("role");
      const cell = this.doc.createElement(role === "cell" ? "td" : "th");
      if (role === "columnheader") {
        cell.scope = "col";
      } else if (role === "rowheader") {
        cell.scope = "row";
      }
      for (const [sourceAttribute, targetAttribute] of [
        ["aria-colspan", "colspan"],
        ["aria-rowspan", "rowspan"],
      ] as const) {
        const value = sourceCell.getAttribute(sourceAttribute) ?? "";
        if (/^[1-9]\d{0,2}$/.test(value)) {
          cell.setAttribute(targetAttribute, value);
        }
      }
      for (const child of Array.from(sourceCell.childNodes)) {
        cell.append(child.cloneNode(true));
      }
      row.append(cell);
    }
    return row;
  }

  private preserveHostCodeLanguages(root: Element): void {
    for (const code of root.querySelectorAll<HTMLElement>("pre code")) {
      const pre = code.closest("pre");
      const wrapper =
        pre?.closest('[data-testid*="code-block" i], [data-code-block]') ?? pre?.parentElement;
      if (!wrapper) {
        continue;
      }
      const candidates = [
        code.getAttribute("lang"),
        code.getAttribute("data-language"),
        pre?.getAttribute("data-language"),
        ...Array.from(wrapper.querySelectorAll<HTMLElement>(CODE_LANGUAGE_SELECTORS)).flatMap(
          (candidate) => [
            candidate.getAttribute("data-code-language"),
            candidate.getAttribute("data-language"),
            candidate.textContent,
          ],
        ),
      ];
      for (const candidate of candidates) {
        const language = normalizeSupportedCodeLanguageLabel(candidate ?? "");
        if (language) {
          code.setAttribute("lang", language);
          break;
        }
      }
      wrapper.querySelectorAll(CODE_LANGUAGE_SELECTORS).forEach((candidate) => {
        if (candidate !== code && !candidate.contains(code)) {
          candidate.remove();
        }
      });
    }
  }

  private normalizeCitations(root: Element, sourceUrl: string): void {
    for (const context of Array.from(root.querySelectorAll(CITATION_CONTEXT_SELECTOR))) {
      if (!root.contains(context)) {
        continue;
      }
      const anchor = context.matches("a[href]")
        ? (context as HTMLAnchorElement)
        : context.querySelector<HTMLAnchorElement>("a[href]");
      if (!anchor) {
        context.querySelectorAll("img, svg, button").forEach((element) => element.remove());
        continue;
      }
      const labelClone = anchor.cloneNode(true) as HTMLElement;
      labelClone
        .querySelectorAll("img, svg, button, [aria-hidden='true']")
        .forEach((element) => element.remove());
      labelClone.querySelectorAll("span").forEach((span) => {
        if (/^\+\d+$/.test(normalizedText(span.textContent))) {
          span.remove();
        }
      });
      const label = normalizedText(labelClone.textContent);
      if (!label) {
        context.remove();
        continue;
      }
      const cite = this.doc.createElement("cite");
      const href = this.cleanCitationHref(anchor.getAttribute("href") ?? "", sourceUrl);
      if (href) {
        const cleanAnchor = this.doc.createElement("a");
        cleanAnchor.href = href;
        cleanAnchor.textContent = label;
        cite.append(cleanAnchor);
      } else {
        cite.textContent = label;
      }
      context.replaceWith(cite);
    }
  }

  private cleanCitationHref(value: string, sourceUrl: string): string | null {
    try {
      const url = new URL(value, sourceUrl);
      if (!/^https?:$/.test(url.protocol)) {
        return null;
      }
      for (const key of Array.from(url.searchParams.keys())) {
        if (/^(?:utm_|gclid$|fbclid$|ref$|source$)/i.test(key)) {
          url.searchParams.delete(key);
        }
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  private normalizeAttachments(root: Element): void {
    for (const context of Array.from(root.querySelectorAll(ATTACHMENT_CONTEXT_SELECTOR))) {
      if (!root.contains(context)) {
        continue;
      }
      const filename = normalizedText(
        context.getAttribute("data-file-name") ??
          context.getAttribute("data-filename") ??
          context.textContent,
      );
      if (!filename || filename.length > 512) {
        context.remove();
        continue;
      }
      const reference = this.doc.createElement("span");
      reference.textContent = filename;
      reference.title = "Attached file";
      context.replaceWith(reference);
    }
  }

  private pruneImages(root: Element): void {
    for (const image of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
      const source = image.getAttribute("src") ?? "";
      const alt = normalizedText(image.getAttribute("alt"));
      const visualContext = image.closest(VISUAL_CONTEXT_SELECTOR);
      const excludedContext = image.closest(EXCLUDED_IMAGE_CONTEXT_SELECTOR);
      const width = this.safeImageDimension(image.getAttribute("width"));
      const height = this.safeImageDimension(image.getAttribute("height"));
      const strongSizeEvidence = width >= 240 && height >= 120;
      const qualifies =
        isSafeImageSource(source) &&
        !isKnownFaviconSource(source) &&
        Boolean(alt) &&
        !excludedContext &&
        (Boolean(visualContext) || strongSizeEvidence);
      if (!qualifies) {
        image.remove();
        continue;
      }
      image.alt = alt;
      for (const [attribute, dimension] of [
        ["width", width],
        ["height", height],
      ] as const) {
        if (dimension > 0) {
          image.setAttribute(attribute, String(dimension));
        } else {
          image.removeAttribute(attribute);
        }
      }
      if (!image.closest("figure")) {
        const figure = this.doc.createElement("figure");
        image.replaceWith(figure);
        figure.append(image);
      }
    }
    root.querySelectorAll("figure").forEach((figure) => {
      if (!figure.querySelector("img") && !normalizedText(figure.textContent)) {
        figure.remove();
      }
    });
  }

  private safeImageDimension(value: string | null): number {
    return /^\d{1,5}$/.test(value ?? "") ? Number(value) : 0;
  }

  private getSourceConversationId(sourceUrl: string): string | undefined {
    try {
      const url = new URL(sourceUrl);
      const pathMatch = url.pathname.match(/^\/(?:chat|work)\/([^/]+)(?:\/|$)/);
      const pathId = validStableId(pathMatch?.[1]);
      if (pathId && !/^(?:new|login|signup)$/i.test(pathId)) {
        return pathId;
      }
      for (const key of ["conversationId", "conversation", "chatId", "id"]) {
        const queryId = validStableId(url.searchParams.get(key));
        if (queryId) {
          return queryId;
        }
      }
      const root = this.findConversationRoot();
      for (const attribute of ["data-conversation-id", "data-chat-id", "data-thread-id"]) {
        const domId = validStableId(root?.getAttribute(attribute));
        if (domId) {
          return domId;
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private getSafeTitle(): string | null {
    for (const selector of ['[data-testid="conversation-title"]', "[data-conversation-title]"]) {
      const title = normalizedText(this.doc.querySelector(selector)?.textContent);
      if (title && title.length <= 200) {
        return title;
      }
    }
    const title = normalizedText(this.doc.title)
      .replace(/\s*[-–—|]\s*(?:Mistral(?: Vibe)?|Vibe|Le Chat)\s*$/i, "")
      .trim();
    return title && !/^(?:Mistral(?: Vibe)?|Vibe|Le Chat)$/i.test(title) && title.length <= 200
      ? title
      : null;
  }
}
