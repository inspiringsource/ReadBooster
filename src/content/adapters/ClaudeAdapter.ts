import { pairContentBlocksIntoTurns } from "../../shared/conversation";
import {
  DOCUMENT_CONTENT_BLOCK_KIND,
  READBOOSTER_CONTENT_BLOCK_ATTRIBUTE,
} from "../../shared/contentKinds";
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
import {
  createClaudeConversationScanSource,
  findClaudeConversationScroller,
} from "./claudeSourceScanner";
import type { ConversationAdapter } from "./ConversationAdapter";

const HOSTNAME = "claude.ai";

// Claude's page DOM is not a public API. Semantic role and test attributes are preferred, with
// branded presentation classes retained only as narrow fallbacks. Keep all maintenance-sensitive
// assumptions in this adapter and its fixture rather than in the shared reader.
const PRIMARY_ROLE_BOUNDARY_SELECTORS: Record<ConversationRole, readonly string[]> = {
  user: [
    '[data-message-author-role="user"][data-message-id]',
    '[data-testid="user-message"][data-message-id]',
  ],
  assistant: [
    '[data-message-author-role="assistant"][data-message-id]',
    '[data-testid="assistant-message"][data-message-id]',
  ],
};

const ROLE_CONTAINER_SELECTORS: Record<ConversationRole, readonly string[]> = {
  user: [
    ...PRIMARY_ROLE_BOUNDARY_SELECTORS.user,
    '[data-message-author-role="user"]',
    '[data-testid="user-message"]',
    '[data-role="user"]',
    'article[data-role="user"]',
  ],
  assistant: [
    ...PRIMARY_ROLE_BOUNDARY_SELECTORS.assistant,
    '[data-message-author-role="assistant"]',
    '[data-testid="assistant-message"]',
    '[data-testid="assistant-response"]',
    '[data-role="assistant"]',
    'article[data-role="assistant"]',
    "[data-is-streaming]",
    ".font-claude-response",
  ],
};

const ALL_ROLE_SELECTOR = [
  ...ROLE_CONTAINER_SELECTORS.user,
  ...ROLE_CONTAINER_SELECTORS.assistant,
].join(",");

const CONTENT_ROOT_SELECTORS: Record<ConversationRole, readonly string[]> = {
  user: [
    '[data-testid="user-message-content"]',
    '[data-message-content="user"]',
    '[data-testid="user-message"]',
  ],
  assistant: [
    '[data-testid="assistant-message-content"]',
    '[data-testid="assistant-response"]',
    '[data-message-content="assistant"]',
    "[data-is-streaming]",
    ".font-claude-response",
    ".prose",
  ],
};

const CONVERSATION_ROOT_SELECTORS = [
  '[data-testid="conversation"]',
  '[data-testid="chat-messages"]',
  '[data-testid="conversation-thread"]',
  "[data-conversation-id]",
  "[data-chat-id]",
  'main[role="main"]',
  "main",
] as const;

const INACTIVE_SELECTOR = [
  "[hidden]",
  '[aria-hidden="true"]',
  "[inert]",
  '[data-active="false"]',
  '[data-selected="false"]',
  '[data-state="inactive"]',
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
  "canvas",
  '[role="menu"]',
  '[role="toolbar"]',
  '[contenteditable="true"]',
  '[data-testid*="actions" i]',
  '[data-testid*="feedback" i]',
  '[data-testid*="regenerate" i]',
  '[data-testid*="retry" i]',
  '[data-testid*="copy" i]',
  '[data-testid*="share" i]',
  '[data-testid*="edit" i]',
  '[data-testid*="model-selector" i]',
  '[aria-label*="feedback" i]',
  '[aria-label*="regenerate" i]',
  '[aria-label*="retry" i]',
  '[aria-label*="copy" i]',
  '[aria-label*="share" i]',
  '[aria-label*="edit" i]',
  '[aria-label*="read aloud" i]',
  '[aria-label*="menu" i]',
].join(",");

const MESSAGE_CHROME_SELECTORS = [
  '[data-testid*="message-author" i]',
  '[data-testid*="message-metadata" i]',
  '[data-testid*="message-footer" i]',
  '[data-testid*="message-header" i]',
  '[data-testid*="timestamp" i]',
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

const ARTIFACT_CONTAINER_SELECTOR = [
  '[data-testid="artifact"]',
  '[data-testid="artifact-card"]',
  "[data-artifact-id]",
  "[data-artifact-type]",
].join(",");

const ARTIFACT_CONTENT_SELECTORS = [
  '[data-testid="artifact-content"]',
  "[data-artifact-content]",
  '[data-testid="artifact-renderer"]',
  '[data-testid="artifact-preview"]',
] as const;

const ARTIFACT_CONTROL_SELECTORS = [
  HOST_UI_SELECTORS,
  "header button",
  '[data-testid*="artifact-controls" i]',
  '[data-testid*="artifact-toolbar" i]',
  '[aria-label*="artifact" i][role="button"]',
].join(",");

const ARTIFACT_EDITING_ATTRIBUTES = [
  "contenteditable",
  "aria-disabled",
  "spellcheck",
  "tabindex",
  "data-artifact-editor",
  "data-artifact-editable",
] as const;

const VISUAL_CONTEXT_SELECTOR = [
  "figure",
  '[data-testid*="generated-image" i]',
  '[data-testid*="response-image" i]',
  '[data-content-image="true"]',
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
  '[aria-label*="avatar" i]',
  '[aria-label*="icon" i]',
].join(",");

const SOURCE_MESSAGE_ID_ATTRIBUTES: Record<ConversationRole, readonly string[]> = {
  user: ["data-message-id", "data-message-uuid", "data-uuid", "data-request-id", "data-turn-id"],
  assistant: [
    "data-message-id",
    "data-message-uuid",
    "data-uuid",
    "data-response-id",
    "data-turn-id",
  ],
};

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

function isReadBoosterNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("#readbooster-control-root, #readbooster-reader-root"));
}

export class ClaudeAdapter implements ConversationAdapter {
  readonly source = "claude" as const;
  readonly displayName = "Claude";
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
      const path = new URL(this.pageUrl()).pathname;
      return path === "/new" || /^\/chat\/[^/]+\/?$/.test(path);
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
      return this.getMessageCandidates().some(
        (candidate) =>
          candidate.role === "assistant" &&
          Boolean(
            this.extractBlock(
              candidate.element,
              candidate.role,
              this.pageUrl(),
              this.getSourceConversationId(this.pageUrl()),
              new Date().toISOString(),
            ),
          ),
      );
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

      for (const candidate of this.getMessageCandidates()) {
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
          // A stale, partially mounted, or streaming node cannot discard neighboring messages.
        }
      }

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
          ? `claude-${sourceConversationId}`
          : `claude-document-${simpleHash(sourceUrl)}`,
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
      const onlyReadBoosterChanges = records.every((record) => {
        if (record.type === "characterData") {
          return isReadBoosterNode(record.target);
        }
        return [...record.addedNodes, ...record.removedNodes].every(isReadBoosterNode);
      });
      if (!onlyReadBoosterChanges) {
        schedule();
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy", "aria-hidden", "data-is-streaming", "hidden"],
    });
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
    const scroller = findClaudeConversationScroller(this.doc, candidates);
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
        source: createClaudeConversationScanSource(scroller),
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
      if (this.isActiveCandidate(canonical) && !byElement.has(canonical)) {
        byElement.set(canonical, { element: canonical, role: candidate.role });
      }
    }
    const canonicalCandidates = Array.from(byElement.values());
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
      const sourceId = this.getReliableMessageId(candidate.element, candidate.role);
      const key = sourceId ? `${candidate.role}:${sourceId}` : "";
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
      recordConversationPipelineDiagnostics({
        canonicalCandidates: canonicalCandidates.length,
        deduplicatedCandidates: deduplicated.length,
      });
    }
    return deduplicated;
  }

  private canonicalizeCandidate(candidate: Element, role: ConversationRole): Element {
    const primarySelector = PRIMARY_ROLE_BOUNDARY_SELECTORS[role].join(",");
    const primaryBoundary = candidate.closest(primarySelector);
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

  private contentRoots(container: Element, role: ConversationRole): Element[] {
    const selectors = CONTENT_ROOT_SELECTORS[role];
    const candidates: Element[] = [];
    for (const selector of selectors) {
      if (container.matches(selector)) {
        candidates.push(container);
      }
      container.querySelectorAll(selector).forEach((element) => candidates.push(element));
    }
    if (role === "assistant") {
      container
        .querySelectorAll(ARTIFACT_CONTAINER_SELECTOR)
        .forEach((element) => candidates.push(element));
    }

    const active = Array.from(new Set(candidates)).filter(
      (candidate) => this.isActiveCandidate(candidate) && !candidate.closest(HOST_UI_SELECTORS),
    );
    const outermost = active.filter(
      (candidate) => !active.some((other) => other !== candidate && other.contains(candidate)),
    );
    const selected = outermost.length > 0 ? outermost : [container];
    return selected.sort((left, right) => {
      if (left === right) {
        return 0;
      }
      const position = left.compareDocumentPosition(right);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  private cloneContentRoot(container: Element, role: ConversationRole): HTMLElement {
    const root = this.doc.createElement("div");
    for (const sourceRoot of this.contentRoots(container, role)) {
      root.append(sourceRoot.cloneNode(true));
    }
    return root;
  }

  private extractBlock(
    container: Element,
    role: ConversationRole,
    sourceUrl: string,
    sourceConversationId: string | undefined,
    extractedAt: string,
  ): DocumentContentBlock | null {
    const contentRoot = this.cloneContentRoot(container, role);
    contentRoot.querySelectorAll(INACTIVE_SELECTOR).forEach((element) => element.remove());
    if (role === "assistant") {
      this.normalizeInlineArtifacts(contentRoot);
    }
    this.preserveHostCodeLanguages(contentRoot);
    this.normalizeCitations(contentRoot, sourceUrl);
    this.pruneImages(contentRoot);
    contentRoot.querySelectorAll(MESSAGE_CHROME_SELECTORS).forEach((element) => element.remove());
    contentRoot.querySelectorAll(HOST_UI_SELECTORS).forEach((element) => element.remove());

    const sourceMessageId = this.getReliableMessageId(container, role) || undefined;
    const id = sourceMessageId || this.getSessionFallbackMessageId(container, role);
    const { html, text } = sanitizeResponseHtml(contentRoot, id, {
      preserveInternalContentKinds: role === "assistant",
    });
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

  private normalizeInlineArtifacts(root: Element): void {
    // Never trust a host-provided internal marker. Only normalized, bounded artifacts may add it.
    root
      .querySelectorAll(`[${READBOOSTER_CONTENT_BLOCK_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(READBOOSTER_CONTENT_BLOCK_ATTRIBUTE));

    const candidates = Array.from(root.querySelectorAll<HTMLElement>(ARTIFACT_CONTAINER_SELECTOR));
    const uniqueOutermost = candidates.filter(
      (candidate) => !candidates.some((other) => other !== candidate && other.contains(candidate)),
    );
    for (const artifact of uniqueOutermost) {
      const content =
        ARTIFACT_CONTENT_SELECTORS.map((selector) => artifact.querySelector(selector)).find(
          (candidate): candidate is Element => Boolean(candidate),
        ) ?? artifact;
      const clone = content.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(INACTIVE_SELECTOR).forEach((element) => element.remove());
      clone.querySelectorAll(ARTIFACT_CONTROL_SELECTORS).forEach((element) => element.remove());
      for (const element of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))]) {
        for (const attribute of ARTIFACT_EDITING_ATTRIBUTES) {
          element.removeAttribute(attribute);
        }
      }
      if (!this.hasMeaningfulContent(clone)) {
        artifact.remove();
        continue;
      }

      const artifactType = normalizedText(
        artifact.getAttribute("data-artifact-type") ??
          artifact.getAttribute("data-type") ??
          artifact.getAttribute("data-language"),
      ).toLowerCase();
      const codeOnly =
        /(?:code|javascript|typescript|python|html|css|sql)/.test(artifactType) &&
        Boolean(clone.querySelector("pre, code")) &&
        !clone.querySelector("p, h1, h2, h3, h4, h5, h6, table, ul, ol, blockquote");
      const replacement = this.doc.createElement("div");
      if (!codeOnly) {
        replacement.setAttribute(READBOOSTER_CONTENT_BLOCK_ATTRIBUTE, DOCUMENT_CONTENT_BLOCK_KIND);
      }
      replacement.append(...Array.from(clone.childNodes));
      artifact.replaceWith(replacement);
    }
  }

  private hasMeaningfulContent(root: Element): boolean {
    return Boolean(
      normalizedText(root.textContent) || root.querySelector("img, figure, pre, table, math"),
    );
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
    this.fallbackMessageCounter += 1;
    const id = `claude-${role}-session-${this.fallbackMessageCounter}`;
    this.fallbackMessageIds.set(container, id);
    return id;
  }

  private preserveHostCodeLanguages(root: Element): void {
    for (const code of root.querySelectorAll<HTMLElement>("pre code")) {
      const pre = code.closest("pre");
      const wrapper =
        pre?.closest('[data-testid*="code" i], [data-code-block], [data-language]') ??
        pre?.parentElement;
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

  private pruneImages(root: Element): void {
    for (const image of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
      const source = image.getAttribute("src") ?? "";
      const alt = normalizedText(image.getAttribute("alt"));
      const visualContext = image.closest(VISUAL_CONTEXT_SELECTOR);
      const excludedContext = image.closest(EXCLUDED_IMAGE_CONTEXT_SELECTOR);
      const width = this.safeImageDimension(image.getAttribute("width"));
      const height = this.safeImageDimension(image.getAttribute("height"));
      const qualifies =
        isSafeImageSource(source) &&
        !isKnownFaviconSource(source) &&
        Boolean(alt) &&
        !excludedContext &&
        (Boolean(visualContext) || (width >= 240 && height >= 120));
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
  }

  private safeImageDimension(value: string | null): number {
    return value && /^\d{1,5}$/.test(value) ? Number(value) : 0;
  }

  private getSourceConversationId(sourceUrl: string): string | undefined {
    try {
      const url = new URL(sourceUrl);
      const routeId = url.pathname.match(/^\/chat\/([^/?#]+)/)?.[1];
      const decoded = routeId ? decodeURIComponent(routeId).trim() : "";
      if (validStableId(decoded) && !/^(?:new|login|signup)$/i.test(decoded)) {
        return decoded;
      }
    } catch {
      // Continue with bounded public DOM metadata.
    }
    for (const attribute of ["data-conversation-id", "data-chat-id", "data-thread-id"]) {
      const value = validStableId(this.findConversationRoot()?.getAttribute(attribute));
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  private getSafeTitle(): string | null {
    for (const selector of [
      '[data-testid="conversation-title"]',
      "[data-conversation-title]",
      '[data-testid="chat-title"]',
    ]) {
      const title = normalizedText(this.doc.querySelector(selector)?.textContent);
      if (title && title.length <= 200) {
        return title;
      }
    }
    const title = normalizedText(this.doc.title)
      .replace(/\s*[-|·]\s*Claude\s*$/i, "")
      .trim();
    return title && !/^(?:Claude|New chat)$/i.test(title) && title.length <= 200 ? title : null;
  }
}
