import type {
  ConversationDocument,
  ConversationRole,
  ConversationScanOptions,
  ConversationScanResult,
  DocumentContentBlock,
  ExtractedResponse,
} from "../../shared/types";
import {
  recordConversationPipelineDiagnostics,
  resetConversationPipelineDiagnostics,
} from "../../shared/developmentDiagnostics";
import { pairContentBlocksIntoTurns } from "../../shared/conversation";
import { scanConversationSource } from "../conversationSourceScanner";
import { assistantBlocks, toExtractedResponse } from "../../shared/types";
import {
  isKnownFaviconSource,
  isSafeImageSource,
  normalizeSupportedCodeLanguageLabel,
  sanitizeResponseHtml,
} from "../sanitize";
import type { ConversationAdapter } from "./ConversationAdapter";
import {
  createChatGPTConversationScanSource,
  findChatGPTConversationScroller,
} from "./chatgptSourceScanner";

const HOSTNAME = "chatgpt.com";

// Prefer message metadata and semantic turn attributes. ChatGPT's DOM is private, so these
// selectors still require live review even though generated presentation classes are avoided.
const ROLE_CONTAINER_SELECTORS: Record<ConversationRole, readonly string[]> = {
  assistant: ['[data-message-author-role="assistant"]', 'article[data-turn="assistant"]'],
  user: ['[data-message-author-role="user"]', 'article[data-turn="user"]'],
};

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

// These semantic or host-metadata containers are intentionally narrow. ChatGPT's generated
// output DOM is private and must be rechecked when its artifact markup changes.
const VISUAL_RESULT_CONTAINER_SELECTOR = [
  "figure",
  '[data-testid*="chart" i]',
  '[data-testid*="artifact" i]',
  '[data-testid*="generated-output" i]',
  '[aria-label*="chart" i]',
].join(",");

const VISUAL_CONTROL_ANCESTOR_SELECTOR = [
  "button",
  '[role="button"]',
  "nav",
  '[role="menu"]',
  '[data-testid*="control" i]',
  '[data-testid*="action" i]',
].join(",");

const CITATION_CONTEXT_SELECTOR = [
  '[data-testid*="citation" i]',
  '[data-testid*="source" i]',
  '[data-testid*="reference" i]',
  '[aria-label*="citation" i]',
  '[aria-label*="source" i]',
  '[aria-label*="reference" i]',
  '[role="doc-biblioref"]',
  "[data-citation]",
  "[data-reference-id]",
].join(",");

interface MessageCandidate {
  element: Element;
  role: ConversationRole;
}

interface VerifiedChartCard {
  image: HTMLImageElement;
  title: string;
}

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

  private scanInFlight: Promise<ConversationScanResult> | null = null;

  constructor(
    private readonly doc: Document = document,
    private readonly hostname: string = window.location.hostname,
    private readonly currentUrl?: string,
  ) {}

  isSupportedPage(): boolean {
    return this.hostname === HOSTNAME || this.hostname.endsWith(`.${HOSTNAME}`);
  }

  getConversationDocument(): ConversationDocument | null {
    if (import.meta.env.DEV) {
      resetConversationPipelineDiagnostics();
    }
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
        if (import.meta.env.DEV) {
          recordConversationPipelineDiagnostics({
            extractedAssistantBlocks: 0,
            normalizedTurns: 0,
          });
        }
        return null;
      }

      const turns = pairContentBlocksIntoTurns(blocks);
      if (import.meta.env.DEV) {
        recordConversationPipelineDiagnostics({
          extractedAssistantBlocks: blocks.filter((block) => block.role === "assistant").length,
          normalizedTurns: turns.length,
        });
      }

      return {
        id: sourceConversationId
          ? `chatgpt-${sourceConversationId}`
          : `chatgpt-document-${simpleHash(sourceUrl)}`,
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

  scanConversationDocument(options: ConversationScanOptions = {}): Promise<ConversationScanResult> {
    if (this.scanInFlight) {
      return this.scanInFlight;
    }

    const operation = this.performConversationScan(options);
    this.scanInFlight = operation;
    const clearInFlight = (): void => {
      if (this.scanInFlight === operation) {
        this.scanInFlight = null;
      }
    };
    void operation.then(clearInFlight, clearInFlight);
    return operation;
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
    const scroller = findChatGPTConversationScroller(this.doc, candidates);
    if (!scroller) {
      return {
        document: initialDocument,
        scanPerformed: false,
        completed: false,
        terminationReason: "single-snapshot",
      };
    }

    try {
      const result = await scanConversationSource({
        initialDocument,
        source: createChatGPTConversationScanSource(scroller),
        captureSnapshot: () => this.getConversationDocument(),
        signal: options.signal,
        onProgress: (progress) => {
          if (import.meta.env.DEV) {
            recordConversationPipelineDiagnostics({
              scanStep: progress.step,
              sourceScrollPosition: progress.sourceScrollPosition,
              mountedScanUserCount: progress.mountedUserCount,
              mountedScanAssistantCount: progress.mountedAssistantCount,
              accumulatedScanAssistantCount: progress.accumulatedAssistantCount,
              sourceDomChanged: progress.sourceDomChanged,
            });
          }
          options.onProgress?.(progress);
        },
      });
      if (import.meta.env.DEV) {
        recordConversationPipelineDiagnostics({
          scanTerminationReason: result.terminationReason,
        });
      }
      return result;
    } catch {
      const aborted = options.signal?.aborted ?? false;
      return {
        document: initialDocument,
        scanPerformed: true,
        completed: false,
        terminationReason: aborted ? "aborted" : "failed",
      };
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

    if (import.meta.env.DEV) {
      recordConversationPipelineDiagnostics({
        rawAssistantCandidates: raw.filter((candidate) => candidate.role === "assistant").length,
        rawUserCandidates: raw.filter((candidate) => candidate.role === "user").length,
      });
    }

    const byElement = new Map<Element, MessageCandidate>();
    for (const candidate of raw) {
      const canonical = this.canonicalizeCandidate(candidate.element, candidate.role);
      if (!byElement.has(canonical)) {
        byElement.set(canonical, { element: canonical, role: candidate.role });
      }
    }

    const canonicalCandidates = Array.from(byElement.values());
    if (import.meta.env.DEV) {
      recordConversationPipelineDiagnostics({ canonicalCandidates: canonicalCandidates.length });
    }

    // Nested role markers are a second selector representation of the same message. Prefer the
    // innermost candidate, while preserving every sibling message even when their outer markup or
    // generic test IDs are identical.
    const individualCandidates = canonicalCandidates.filter(
      (candidate) =>
        !canonicalCandidates.some(
          (other) =>
            other !== candidate &&
            other.role === candidate.role &&
            candidate.element.contains(other.element),
        ),
    );

    const ordered = individualCandidates.sort((left, right) => {
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
      const hostId = this.getReliableMessageId(candidate.element);
      const dedupeKey = hostId ? `${candidate.role}:${hostId}` : "";
      if (dedupeKey && seen.has(dedupeKey)) {
        continue;
      }
      if (dedupeKey) {
        seen.add(dedupeKey);
      }
      newestFirst.push(candidate);
    }
    const deduplicated = newestFirst.reverse();
    if (import.meta.env.DEV) {
      recordConversationPipelineDiagnostics({ deduplicatedCandidates: deduplicated.length });
    }
    return deduplicated;
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
    const sourceContentRoot = this.findContentRoot(container);
    const clonedContentRoot = this.findContentRoot(clone);
    this.preserveVisualContent(sourceContentRoot, clonedContentRoot);
    this.preserveHostCodeLanguages(clonedContentRoot);
    this.removeCitationCounters(clonedContentRoot);
    this.pruneHostOnlyContent(clone);
    const contentRoot = this.findContentRoot(clone);
    const normalizedRoot = this.doc.createElement("div");
    if (role === "assistant") {
      this.getAssociatedChartCards(container).forEach((chart) => {
        normalizedRoot.append(this.createChartFigure(chart));
      });
    }
    normalizedRoot.append(contentRoot);
    const sourceMessageId = this.getReliableMessageId(container) || undefined;
    const fallbackSeed = [
      (normalizedRoot.textContent ?? "").replace(/\s+/g, " ").trim(),
      ...Array.from(normalizedRoot.querySelectorAll("img"), (image) =>
        [image.getAttribute("alt"), image.getAttribute("width"), image.getAttribute("height")]
          .filter(Boolean)
          .join(":"),
      ),
    ].join("|");
    const id = sourceMessageId || `chatgpt-${role}-${index}-${simpleHash(fallbackSeed)}`;
    const { html, text } = sanitizeResponseHtml(normalizedRoot, id);
    const sanitizedContainer = this.doc.createElement("div");
    sanitizedContainer.innerHTML = html;
    if (!text && !sanitizedContainer.querySelector("img, figure")) {
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

  private getReliableMessageId(container: Element): string {
    const ownId = container.getAttribute("data-message-id")?.trim();
    if (ownId) {
      return ownId;
    }

    const descendantIds = new Set(
      Array.from(container.querySelectorAll("[data-message-id]"), (element) =>
        element.getAttribute("data-message-id")?.trim(),
      ).filter((value): value is string => Boolean(value)),
    );
    return descendantIds.size === 1 ? (descendantIds.values().next().value ?? "") : "";
  }

  private canonicalizeCandidate(candidate: Element, role: ConversationRole): Element {
    const roleSelector = ROLE_CONTAINER_SELECTORS[role].join(",");
    const messageContainer = candidate.closest("[data-message-id]");
    if (messageContainer) {
      const anyRoleSelector = [
        ...ROLE_CONTAINER_SELECTORS.user,
        ...ROLE_CONTAINER_SELECTORS.assistant,
      ].join(",");
      const roleContainerCount =
        messageContainer.querySelectorAll(anyRoleSelector).length +
        (messageContainer.matches(anyRoleSelector) ? 1 : 0);
      if (roleContainerCount <= 1) {
        return messageContainer;
      }
    }

    if (candidate.matches(roleSelector)) {
      return candidate;
    }

    const nestedRoleContainers = candidate.querySelectorAll(roleSelector);
    if (nestedRoleContainers.length === 1) {
      return nestedRoleContainers[0];
    }

    return candidate;
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

  private preserveVisualContent(sourceRoot: Element, clonedRoot: Element): void {
    const sourceMedia = Array.from(sourceRoot.querySelectorAll("img, canvas, svg"));
    const clonedMedia = Array.from(clonedRoot.querySelectorAll("img, canvas, svg"));

    sourceMedia.forEach((source, index) => {
      const clone = clonedMedia[index];
      if (!clone) {
        return;
      }
      if (source instanceof HTMLImageElement && this.isCitationImage(source)) {
        this.normalizeCitationImage(clone);
        return;
      }
      if (!this.isMeaningfulVisual(source)) {
        clone.remove();
        return;
      }

      if (source instanceof HTMLImageElement) {
        const image = this.captureImage(source);
        if (image) {
          this.replaceVisual(clone, image);
        } else {
          this.replaceWithCaptureNotice(clone);
        }
        return;
      }

      if (source instanceof HTMLCanvasElement) {
        try {
          const image = this.doc.createElement("img");
          const capturedSource = source.toDataURL("image/png");
          if (!isSafeImageSource(capturedSource)) {
            throw new Error("Canvas capture did not produce a safe raster image");
          }
          image.src = capturedSource;
          image.alt = this.visualAlternative(source);
          this.setIntrinsicDimensions(image, source.width, source.height);
          this.replaceVisual(clone, image);
        } catch {
          this.replaceWithCaptureNotice(clone);
        }
        return;
      }

      // Raw SVG remains outside the sanitizer trust boundary. A verified chart container gets an
      // accessible failure notice; unrelated interface icons are simply pruned below.
      this.replaceWithCaptureNotice(clone);
    });
  }

  private getAssociatedChartCards(container: Element): VerifiedChartCard[] {
    const assistantRoleSelector = ROLE_CONTAINER_SELECTORS.assistant.join(",");
    const assistantMessage = container.matches(assistantRoleSelector)
      ? container
      : container.querySelector(assistantRoleSelector);
    const wrapper = assistantMessage?.parentElement;
    if (!assistantMessage || !wrapper) {
      return [];
    }

    const cards: VerifiedChartCard[] = [];
    for (const sibling of Array.from(wrapper.children)) {
      if (sibling === assistantMessage) {
        break;
      }
      const images = Array.from(sibling.querySelectorAll<HTMLImageElement>("img")).filter((image) =>
        this.isVerifiedEstuaryOutputImage(image),
      );
      if (images.length !== 1) {
        continue;
      }
      const title = this.findChartCardTitle(sibling, images[0]);
      if (title) {
        cards.push({ image: images[0], title });
      }
    }
    return cards;
  }

  private isVerifiedEstuaryOutputImage(image: HTMLImageElement): boolean {
    if (image.closest(VISUAL_CONTROL_ANCESTOR_SELECTOR) || image.closest("a[href]")) {
      return false;
    }
    try {
      const pageUrl = new URL(this.currentUrl ?? this.doc.location?.href ?? window.location.href);
      const imageUrl = new URL(image.getAttribute("src") ?? "", pageUrl);
      const bounds = image.getBoundingClientRect();
      const width = Math.max(image.naturalWidth, image.width, bounds.width);
      const height = Math.max(image.naturalHeight, image.height, bounds.height);
      return (
        imageUrl.origin === pageUrl.origin &&
        imageUrl.pathname === "/backend-api/estuary/content" &&
        width >= 320 &&
        height >= 160
      );
    } catch {
      return false;
    }
  }

  private findChartCardTitle(card: Element, image: HTMLImageElement): string | null {
    const candidates = Array.from(
      card.querySelectorAll<HTMLElement>("span, h1, h2, h3, h4, h5, h6, figcaption"),
    );
    for (const candidate of candidates) {
      if (
        candidate.contains(image) ||
        candidate.closest(VISUAL_CONTROL_ANCESTOR_SELECTOR) ||
        !(candidate.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING)
      ) {
        continue;
      }
      const title = (candidate.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title && title.length <= 200) {
        return title;
      }
    }
    return null;
  }

  private createChartFigure(chart: VerifiedChartCard): HTMLElement {
    const figure = this.doc.createElement("figure");
    const image = this.doc.createElement("img");
    image.alt = chart.title;
    const width = chart.image.naturalWidth || chart.image.width;
    const height = chart.image.naturalHeight || chart.image.height;
    this.setIntrinsicDimensions(image, width, height);
    image.src = this.captureLoadedImageSource(chart.image) ?? chart.image.src;
    const caption = this.doc.createElement("figcaption");
    caption.textContent = chart.title;
    figure.append(image, caption);
    return figure;
  }

  private captureLoadedImageSource(image: HTMLImageElement): string | null {
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return null;
    }
    try {
      const canvas = this.doc.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }
      context.drawImage(image, 0, 0);
      const source = canvas.toDataURL("image/png");
      return isSafeImageSource(source) ? source : null;
    } catch {
      return null;
    }
  }

  private isMeaningfulVisual(element: Element): boolean {
    if (
      element.closest(VISUAL_CONTROL_ANCESTOR_SELECTOR) ||
      (element instanceof HTMLImageElement && this.isCitationImage(element))
    ) {
      return false;
    }
    const verifiedContainer = Boolean(element.closest(VISUAL_RESULT_CONTAINER_SELECTOR));
    if (element instanceof SVGElement) {
      const labelledAsVisual = /\b(chart|graph|diagram|plot|visual)\b/i.test(
        element.getAttribute("aria-label") ?? "",
      );
      const viewBox = (element.getAttribute("viewBox") ?? "")
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      const viewBoxIsLarge = viewBox.length === 4 && (viewBox[2] >= 64 || viewBox[3] >= 64);
      const bounds = element.getBoundingClientRect();
      const renderedLarge = bounds.width >= 64 || bounds.height >= 64;
      const intrinsicLarge =
        Number.parseFloat(element.getAttribute("width") ?? "0") >= 64 ||
        Number.parseFloat(element.getAttribute("height") ?? "0") >= 64;
      return (
        verifiedContainer && (labelledAsVisual || viewBoxIsLarge || renderedLarge || intrinsicLarge)
      );
    }
    if (element instanceof HTMLCanvasElement) {
      return verifiedContainer || element.width >= 64 || element.height >= 64;
    }
    if (!(element instanceof HTMLImageElement)) {
      return false;
    }
    const source = element.getAttribute("src") ?? "";
    const bounds = element.getBoundingClientRect();
    const renderedWidth = Math.max(bounds.width, element.naturalWidth);
    const renderedHeight = Math.max(bounds.height, element.naturalHeight);
    const declaredWidth = element.width;
    const declaredHeight = element.height;
    const hasMeaningfulDimensions =
      Math.max(renderedWidth, declaredWidth) >= 96 &&
      Math.max(renderedHeight, declaredHeight) >= 64;
    const hasStrongStandaloneEvidence =
      !element.closest("a[href]") && renderedWidth >= 320 && renderedHeight >= 120;
    const semanticFigure = Boolean(element.closest("figure"));
    return (
      isSafeImageSource(source) &&
      (semanticFigure ||
        (hasMeaningfulDimensions && verifiedContainer) ||
        hasStrongStandaloneEvidence)
    );
  }

  private isCitationImage(image: HTMLImageElement): boolean {
    if (isKnownFaviconSource(image.getAttribute("src") ?? "")) {
      return true;
    }
    if (image.closest(CITATION_CONTEXT_SELECTOR)) {
      return true;
    }
    const anchor = image.closest("a[href]");
    if (!anchor || image.getAttribute("alt") !== "") {
      return false;
    }
    const text = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
    const width = image.width;
    const height = image.height;
    return Boolean(text) && width > 0 && height > 0 && width <= 128 && height <= 128;
  }

  private normalizeCitationImage(imageClone: Element): void {
    const anchor = imageClone.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) {
      imageClone.remove();
      return;
    }
    const label = (anchor.textContent ?? "")
      .replace(/(?:^|\s)\+\d+(?=\s|$)/g, " ")
      .replace(/\+\d+\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    const href = this.cleanCitationHref(anchor.getAttribute("href") ?? "");
    if (!label || !href) {
      anchor.remove();
      return;
    }
    const citation = this.doc.createElement("cite");
    const link = this.doc.createElement("a");
    link.href = href;
    link.textContent = /^source\s*:/i.test(label) ? label : `Source: ${label}`;
    citation.append(link);
    anchor.replaceWith(citation);
  }

  private cleanCitationHref(value: string): string | null {
    try {
      const url = new URL(value, this.currentUrl ?? this.doc.location?.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return null;
      }
      if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname === "/url") {
        const target = url.searchParams.get("url") ?? url.searchParams.get("q");
        if (target) {
          return this.cleanCitationHref(target);
        }
      }
      for (const key of Array.from(url.searchParams.keys())) {
        if (/^utm_/i.test(key) || /^(?:gclid|fbclid)$/i.test(key)) {
          url.searchParams.delete(key);
        }
      }
      return url.toString();
    } catch {
      return null;
    }
  }

  private removeCitationCounters(root: Element): void {
    root.querySelectorAll(CITATION_CONTEXT_SELECTOR).forEach((context) => {
      context.querySelectorAll("*").forEach((element) => {
        if (element.children.length === 0 && /^\s*\+\d+\s*$/.test(element.textContent ?? "")) {
          element.remove();
        }
      });
    });
  }

  private preserveHostCodeLanguages(root: Element): void {
    for (const code of root.querySelectorAll<HTMLElement>("pre code")) {
      if (
        code.hasAttribute("lang") ||
        Array.from(code.classList).some((name) => /^(?:language|lang)-/i.test(name))
      ) {
        continue;
      }
      let boundary: Element | null = code.closest("pre");
      for (let depth = 0; boundary && boundary !== root && depth < 4; depth += 1) {
        const label = this.findHostLanguageLabel(boundary.previousElementSibling);
        if (label) {
          code.setAttribute("lang", label.language);
          label.element.remove();
          break;
        }
        boundary = boundary.parentElement;
      }
    }
  }

  private findHostLanguageLabel(
    candidate: Element | null,
  ): { element: Element; language: string } | null {
    if (!candidate) {
      return null;
    }
    const elements = [candidate, ...Array.from(candidate.querySelectorAll("*"))].reverse();
    for (const element of elements) {
      const clone = element.cloneNode(true) as Element;
      clone.querySelectorAll(HOST_UI_SELECTORS).forEach((control) => control.remove());
      const language = normalizeSupportedCodeLanguageLabel(clone.textContent ?? "");
      if (language) {
        return { element, language };
      }
    }
    return null;
  }

  private captureImage(source: HTMLImageElement): HTMLImageElement | null {
    const sourceUrl = source.getAttribute("src") ?? "";
    if (!isSafeImageSource(sourceUrl)) {
      return null;
    }
    const image = this.doc.createElement("img");
    image.src = sourceUrl;
    image.alt = this.visualAlternative(source);
    this.setIntrinsicDimensions(
      image,
      source.naturalWidth || source.width,
      source.naturalHeight || source.height,
    );
    return image;
  }

  private visualAlternative(source: Element): string {
    if (source instanceof HTMLImageElement && source.hasAttribute("alt")) {
      return source.getAttribute("alt")?.trim() ?? "";
    }
    const labelled = source.getAttribute("aria-label")?.trim();
    const caption = source.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
    return labelled || caption || "Generated chart";
  }

  private setIntrinsicDimensions(image: HTMLImageElement, width: number, height: number): void {
    if (Number.isFinite(width) && width > 0) {
      image.width = Math.round(width);
    }
    if (Number.isFinite(height) && height > 0) {
      image.height = Math.round(height);
    }
  }

  private replaceVisual(sourceClone: Element, image: HTMLImageElement): void {
    if (sourceClone.closest("figure")) {
      sourceClone.replaceWith(image);
      return;
    }
    const figure = this.doc.createElement("figure");
    figure.append(image);
    sourceClone.replaceWith(figure);
  }

  private replaceWithCaptureNotice(sourceClone: Element): void {
    const caption = this.doc.createElement("figcaption");
    caption.textContent = "Visual could not be captured.";
    const existingFigure = sourceClone.closest("figure");
    if (existingFigure) {
      sourceClone.replaceWith(caption);
      return;
    }
    const figure = this.doc.createElement("figure");
    figure.append(caption);
    sourceClone.replaceWith(figure);
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
