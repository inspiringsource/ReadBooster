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
  createGeminiConversationScanSource,
  findGeminiConversationScroller,
} from "./geminiSourceScanner";

const HOSTNAME = "gemini.google.com";

// Authenticated Gemini DOM was unavailable during 0.5.0 development. These selectors prioritize
// descriptive Angular custom elements used by current Gemini builds, with role/data fallbacks for
// compact fixtures. They require live acceptance and may need maintenance as Gemini evolves.
const ROLE_CONTAINER_SELECTORS: Record<ConversationRole, readonly string[]> = {
  user: ["user-query", '[data-message-author-role="user"]', '[data-test-id="user-query"]'],
  assistant: [
    "model-response",
    '[data-message-author-role="model"]',
    '[data-message-author-role="assistant"]',
    '[data-test-id="model-response"]',
  ],
};

const CONTENT_ROOT_SELECTORS: Record<ConversationRole, readonly string[]> = {
  user: ["user-query-content", '[data-test-id="user-query-content"]', ".query-content"],
  assistant: [
    "message-content",
    '[data-test-id="model-response-content"]',
    ".model-response-text",
    ".markdown-main-panel",
    ".markdown",
  ],
};

const INACTIVE_SELECTOR = [
  "[hidden]",
  '[aria-hidden="true"]',
  "[inert]",
  '[aria-selected="false"]',
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
  "svg",
  "mat-icon",
  "gem-icon",
  '[role="menu"]',
  '[role="toolbar"]',
  '[contenteditable="true"]',
  '[data-test-id*="copy" i]',
  '[data-test-id*="feedback" i]',
  '[data-test-id*="share" i]',
  '[data-test-id*="regenerate" i]',
  '[data-test-id*="draft" i]',
  '[aria-label*="copy" i]',
  '[aria-label*="feedback" i]',
  '[aria-label*="share" i]',
  '[aria-label*="regenerate" i]',
  '[aria-label*="read aloud" i]',
  '[aria-label*="audio" i]',
  '[aria-label*="menu" i]',
  '[aria-label*="show drafts" i]',
  ".code-block-decoration",
  '[data-test-id*="code-header" i]',
  '[class*="code-block-header"]',
].join(",");

const CODE_LANGUAGE_SELECTORS = [
  "[data-code-language]",
  "[data-language]",
  '[data-test-id*="language" i]',
  ".code-block-decoration",
  '[data-test-id*="code-header" i]',
  '[class*="code-block-header"]',
].join(",");

const CITATION_CONTEXT_SELECTOR = [
  "source-footnote",
  '[data-test-id*="citation" i]',
  '[data-test-id*="source" i]',
  '[data-test-id*="reference" i]',
  '[aria-label*="citation" i]',
  '[aria-label*="source" i]',
  '[role="doc-biblioref"]',
  "[data-citation]",
].join(",");

const VISUAL_CONTEXT_SELECTOR = [
  "figure",
  "image-card",
  '[data-test-id*="generated-image" i]',
  '[data-test-id*="response-image" i]',
  '[aria-label*="generated image" i]',
].join(",");

const WRAPPED_RESPONSE_IMAGE_SELECTOR = 'button.image-button, [role="button"].image-button';

const EXCLUDED_WRAPPED_MEDIA_CONTEXT_SELECTOR = [
  CITATION_CONTEXT_SELECTOR,
  "a[href]",
  "nav",
  '[role="menu"]',
  '[role="toolbar"]',
  '[data-test-id*="avatar" i]',
  '[data-test-id*="citation" i]',
  '[data-test-id*="source" i]',
  '[data-test-id*="reference" i]',
  '[aria-label*="avatar" i]',
  '[aria-label*="citation" i]',
  '[aria-label*="source" i]',
].join(",");

const HOST_CONTROL_LABEL =
  /\b(?:copy|feedback|share|audio|listen|download|expand|menu|avatar|source|citation)\b/i;

const MINIMUM_WRAPPED_IMAGE_WIDTH = 320;
const MINIMUM_WRAPPED_IMAGE_HEIGHT = 160;

const SOURCE_MESSAGE_ID_ATTRIBUTES: Record<ConversationRole, readonly string[]> = {
  user: ["data-message-id", "data-query-id", "data-turn-id"],
  assistant: ["data-message-id", "data-response-id", "data-turn-id"],
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

export class GeminiAdapter implements ConversationAdapter {
  readonly source = "gemini" as const;
  readonly capabilities = {
    configured: true,
    implemented: true,
    manuallyVerified: false,
    canExtractResponses: true,
  } as const;

  private scanInFlight: Promise<ConversationScanResult> | null = null;

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
      return path === "/app" || path.startsWith("/app/");
    } catch {
      return false;
    }
  }

  hasLatestAssistantResponse(): boolean {
    if (!this.isSupportedPage()) {
      return false;
    }
    try {
      return this.getRoleCandidates("assistant").some((candidate) => {
        if (!this.isActiveCandidate(candidate)) {
          return false;
        }
        const root = this.findContentRoot(candidate, "assistant");
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
          // A stale, malformed, or streaming node cannot discard valid neighboring messages.
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
          ? `gemini-${sourceConversationId}`
          : `gemini-document-${simpleHash(sourceUrl)}`,
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
    const root =
      // `chat-app` is the narrowest public-shell element observed to survive conversation-level
      // SPA changes. Watching a nested `chat-window-content` would miss replacement of that node.
      this.doc.querySelector("chat-app") ?? this.doc.querySelector("chat-window") ?? this.doc.body;
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
      const onlyReadBoosterAdditions = records.every(
        (record) =>
          record.addedNodes.length > 0 &&
          Array.from(record.addedNodes).every(
            (node) =>
              node instanceof Element &&
              (node.id === "readbooster-control-root" || node.id === "readbooster-reader-root"),
          ),
      );
      if (!onlyReadBoosterAdditions) {
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
    const scroller = findGeminiConversationScroller(this.doc, candidates);
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
        source: createGeminiConversationScanSource(scroller),
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

  private getRoleCandidates(role: ConversationRole): Element[] {
    const candidates: Element[] = [];
    for (const selector of ROLE_CONTAINER_SELECTORS[role]) {
      this.doc.querySelectorAll(selector).forEach((element) => candidates.push(element));
    }
    return candidates;
  }

  private pageUrl(): string {
    return this.currentUrl ?? this.doc.location?.href ?? window.location.href;
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
    const selector = ROLE_CONTAINER_SELECTORS[role].join(",");
    if (candidate.matches(selector)) {
      return candidate;
    }
    return candidate.closest(selector) ?? candidate;
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

  private findContentRoot(container: Element, role: ConversationRole): Element {
    for (const selector of CONTENT_ROOT_SELECTORS[role]) {
      const root = container.querySelector(selector);
      if (root && !root.closest(INACTIVE_SELECTOR)) {
        return root;
      }
    }
    return container;
  }

  private extractBlock(
    container: Element,
    role: ConversationRole,
    index: number,
    sourceUrl: string,
    sourceConversationId: string | undefined,
    extractedAt: string,
  ): DocumentContentBlock | null {
    const sourceRoot = this.findContentRoot(container, role);
    const contentRoot = sourceRoot.cloneNode(true) as Element;
    this.preserveHostCodeLanguages(contentRoot);
    if (role === "assistant") {
      this.normalizeWrappedResponseImages(contentRoot);
    }
    this.normalizeCitations(contentRoot, sourceUrl);
    this.pruneImages(contentRoot);
    contentRoot.querySelectorAll(HOST_UI_SELECTORS).forEach((element) => element.remove());

    const sourceMessageId = this.getReliableMessageId(container, role) || undefined;
    const fallbackSeed = [
      normalizedText(contentRoot.textContent),
      ...Array.from(contentRoot.querySelectorAll("img"), (image) =>
        [image.getAttribute("alt"), image.getAttribute("width"), image.getAttribute("height")]
          .filter(Boolean)
          .join(":"),
      ),
    ].join("|");
    const id = sourceMessageId || `gemini-${role}-${index}-${simpleHash(fallbackSeed)}`;
    const normalizedRoot = this.doc.createElement("div");
    normalizedRoot.append(contentRoot);
    const { html, text } = sanitizeResponseHtml(normalizedRoot, id);
    const sanitized = this.doc.createElement("div");
    sanitized.innerHTML = html;
    if (!text && !sanitized.querySelector("img, figure")) {
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
      const value = container.getAttribute(attribute)?.trim();
      if (value && value.length <= 512) {
        return value;
      }
    }
    for (const attribute of SOURCE_MESSAGE_ID_ATTRIBUTES[role]) {
      const values = new Set(
        Array.from(container.querySelectorAll(`[${attribute}]`), (element) =>
          element.getAttribute(attribute)?.trim(),
        ).filter((value): value is string => Boolean(value)),
      );
      if (values.size === 1) {
        return values.values().next().value ?? "";
      }
    }
    return "";
  }

  private preserveHostCodeLanguages(root: Element): void {
    for (const code of root.querySelectorAll<HTMLElement>("pre code")) {
      const pre = code.closest("pre");
      const wrapper =
        pre?.closest("code-block, [data-test-id*='code-block' i]") ?? pre?.parentElement;
      if (!wrapper) {
        continue;
      }
      const explicitCandidates = [
        code.getAttribute("lang"),
        code.getAttribute("data-language"),
        pre?.getAttribute("data-language"),
      ];
      const hostCandidates = Array.from(
        wrapper.querySelectorAll<HTMLElement>(CODE_LANGUAGE_SELECTORS),
      )
        .filter((candidate) => !candidate.contains(code))
        .flatMap((candidate) => [
          candidate.getAttribute("data-code-language"),
          candidate.getAttribute("data-language"),
          candidate.textContent,
        ]);
      for (const candidate of [...explicitCandidates, ...hostCandidates]) {
        const language = normalizeSupportedCodeLanguageLabel(candidate ?? "");
        if (language) {
          code.setAttribute("lang", language);
          break;
        }
      }
      wrapper.querySelectorAll<HTMLElement>(CODE_LANGUAGE_SELECTORS).forEach((candidate) => {
        if (candidate !== code && !candidate.contains(code)) {
          candidate.remove();
        }
      });
    }
  }

  private normalizeCitations(root: Element, sourceUrl: string): void {
    const contexts = Array.from(root.querySelectorAll(CITATION_CONTEXT_SELECTOR));
    for (const context of contexts) {
      if (!context.isConnected && !root.contains(context)) {
        continue;
      }
      const anchor = context.matches("a[href]")
        ? (context as HTMLAnchorElement)
        : context.querySelector<HTMLAnchorElement>("a[href]");
      if (!anchor) {
        context.querySelectorAll("img, svg, mat-icon, gem-icon").forEach((icon) => icon.remove());
        continue;
      }
      const labelClone = anchor.cloneNode(true) as HTMLElement;
      labelClone
        .querySelectorAll("img, svg, mat-icon, gem-icon, button")
        .forEach((node) => node.remove());
      const label = normalizedText(labelClone.textContent)
        .replace(/(?:^|\s)\+\d+\s*$/, "")
        .trim();
      if (!label) {
        context.replaceWith(anchor);
        continue;
      }
      const cite = this.doc.createElement("cite");
      const link = this.doc.createElement("a");
      link.href = this.cleanCitationHref(anchor.getAttribute("href") ?? "", sourceUrl);
      link.textContent = label;
      cite.append(link);
      context.replaceWith(cite);
    }
  }

  private cleanCitationHref(value: string, sourceUrl: string): string {
    try {
      const url = new URL(value, sourceUrl);
      for (const key of Array.from(url.searchParams.keys())) {
        if (/^(?:utm_|gclid$|ved$|source$)/i.test(key)) {
          url.searchParams.delete(key);
        }
      }
      return url.toString();
    } catch {
      return value;
    }
  }

  /**
   * Gemini sometimes makes a response image itself clickable. Convert only the confirmed
   * response-media shape into inert semantic HTML before the broad host-control removal runs.
   */
  private normalizeWrappedResponseImages(root: Element): void {
    for (const wrapper of root.querySelectorAll<HTMLElement>(WRAPPED_RESPONSE_IMAGE_SELECTOR)) {
      const images = Array.from(wrapper.querySelectorAll<HTMLImageElement>("img"));
      if (images.length !== 1) {
        continue;
      }
      const image = images[0];
      if (!this.isQualifyingWrappedResponseImage(root, wrapper, image)) {
        continue;
      }

      const normalizedImage = this.doc.createElement("img");
      normalizedImage.src = image.getAttribute("src")!.trim();
      normalizedImage.alt = normalizedText(image.getAttribute("alt"));
      for (const attribute of ["width", "height"] as const) {
        const value = image.getAttribute(attribute)?.trim();
        if (value && /^\d{1,5}$/.test(value)) {
          normalizedImage.setAttribute(attribute, value);
        }
      }

      const existingFigure = wrapper.closest("figure");
      if (existingFigure && root.contains(existingFigure)) {
        wrapper.replaceWith(normalizedImage);
        continue;
      }

      const figure = this.doc.createElement("figure");
      figure.append(normalizedImage);
      const caption = wrapper.querySelector("figcaption");
      if (caption && normalizedText(caption.textContent)) {
        const normalizedCaption = this.doc.createElement("figcaption");
        normalizedCaption.textContent = normalizedText(caption.textContent);
        figure.append(normalizedCaption);
      }
      wrapper.replaceWith(figure);
    }
  }

  private isQualifyingWrappedResponseImage(
    root: Element,
    wrapper: HTMLElement,
    image: HTMLImageElement,
  ): boolean {
    const source = image.getAttribute("src")?.trim() ?? "";
    const alternative = normalizedText(image.getAttribute("alt"));
    const width = this.safeImageDimension(image.getAttribute("width"));
    const height = this.safeImageDimension(image.getAttribute("height"));
    const responseImageIdentity =
      image.classList.contains("hero-image") ||
      image.classList.contains("spark-licensed-landscape");
    const outerControl = wrapper.parentElement?.closest("button, [role='button']");
    const labelledAsControl = HOST_CONTROL_LABEL.test(wrapper.getAttribute("aria-label") ?? "");

    return Boolean(
      root.contains(wrapper) &&
      wrapper.classList.contains("image-button") &&
      responseImageIdentity &&
      alternative &&
      alternative.length <= 1_000 &&
      width >= MINIMUM_WRAPPED_IMAGE_WIDTH &&
      height >= MINIMUM_WRAPPED_IMAGE_HEIGHT &&
      isSafeImageSource(source) &&
      !isKnownFaviconSource(source) &&
      !labelledAsControl &&
      !outerControl &&
      !wrapper.closest(EXCLUDED_WRAPPED_MEDIA_CONTEXT_SELECTOR),
    );
  }

  private safeImageDimension(value: string | null): number {
    const normalized = value?.trim() ?? "";
    return /^\d{1,5}$/.test(normalized) ? Number.parseInt(normalized, 10) : 0;
  }

  private pruneImages(root: Element): void {
    for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
      const source = image.getAttribute("src") ?? "";
      const citation = Boolean(image.closest(CITATION_CONTEXT_SELECTOR));
      const control = Boolean(image.closest("button, [role='button'], [role='menu'], nav"));
      const linkedSource = Boolean(image.closest("a[href]") && !image.closest("figure"));
      const bounds = image.getBoundingClientRect();
      const renderedWidth = Math.max(image.naturalWidth, bounds.width);
      const renderedHeight = Math.max(image.naturalHeight, bounds.height);
      const verifiedContext = Boolean(image.closest(VISUAL_CONTEXT_SELECTOR));
      const strongStandaloneEvidence =
        !linkedSource && renderedWidth >= 320 && renderedHeight >= 120;
      if (
        citation ||
        control ||
        linkedSource ||
        isKnownFaviconSource(source) ||
        !isSafeImageSource(source) ||
        (!verifiedContext && !strongStandaloneEvidence)
      ) {
        image.remove();
        continue;
      }
      if (!image.hasAttribute("alt")) {
        image.alt = "Generated image";
      }
    }
  }

  private getSourceConversationId(sourceUrl: string): string | undefined {
    const domIdentity = this.doc
      .querySelector("[data-conversation-id]")
      ?.getAttribute("data-conversation-id")
      ?.trim();
    if (domIdentity && domIdentity.length <= 512) {
      return domIdentity;
    }
    try {
      const url = new URL(sourceUrl);
      const match = url.pathname.match(/^\/app\/([^/]+)\/?$/);
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    } catch {
      return undefined;
    }
  }

  private getSafeTitle(): string | null {
    const selectedConversation = this.doc.querySelector<HTMLElement>(
      'a[aria-current="page"][href*="/app/"]',
    );
    const selectedTitle = normalizedText(selectedConversation?.textContent);
    if (selectedTitle && selectedTitle.length <= 200) {
      return selectedTitle;
    }
    const title = normalizedText(this.doc.title)
      .replace(/\s*[-–—|]\s*Google Gemini\s*$/i, "")
      .trim();
    return title && !/^Google Gemini$/i.test(title) && title.length <= 200 ? title : null;
  }
}
