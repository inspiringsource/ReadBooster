export type ReadingBlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "table"
  | "code"
  | "image"
  | "document"
  | "math"
  | "notice";

export interface ReadingBlockEntry {
  readonly id: string;
  readonly responseId: string;
  readonly sectionId: string;
  readonly kind: ReadingBlockKind;
  readonly order: number;
  readonly element: HTMLElement;
}

const CANDIDATE_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "blockquote",
  "table",
  "pre",
  "figure",
  "img",
  "math",
  ".katex-display",
  '[data-readbooster-content-block="document"]',
  '[role="alert"]',
  '[role="note"]',
].join(", ");

const EXCLUDED_ANCESTOR_SELECTOR = [
  ".rb-block-toolbar",
  ".rb-code-toolbar",
  ".rb-table-toolbar",
  ".rb-document-block__header",
  "[data-readbooster-source-meta]",
  "[hidden]",
  '[aria-hidden="true"]',
].join(", ");

function safeIdPart(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "response"
  );
}

function simpleHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function blockSignature(element: HTMLElement, kind: ReadingBlockKind): string {
  const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const media = Array.from(element.querySelectorAll<HTMLImageElement>("img"), (image) => image.alt)
    .filter(Boolean)
    .join("|");
  return `${kind}:${simpleHash(`${text}|${media}`)}`;
}

function readingUnit(candidate: HTMLElement): HTMLElement {
  return (
    candidate.closest<HTMLElement>('[data-readbooster-content-block="document"]') ??
    candidate.closest<HTMLElement>(".rb-table-block") ??
    candidate.closest<HTMLElement>(".rb-code-block") ??
    candidate.closest<HTMLElement>("figure") ??
    candidate.closest<HTMLElement>("blockquote") ??
    candidate.closest<HTMLElement>("ul, ol") ??
    candidate.closest<HTMLElement>(".katex-display") ??
    candidate
  );
}

function readingBlockKind(element: HTMLElement): ReadingBlockKind {
  if (element.matches('[data-readbooster-content-block="document"]')) return "document";
  if (element.matches(".rb-table-block, table")) return "table";
  if (element.matches(".rb-code-block, pre")) return "code";
  if (
    element.matches("figure, img") ||
    (element.matches("p") &&
      Boolean(element.querySelector("img, svg, canvas")) &&
      !element.textContent?.trim())
  ) {
    return "image";
  }
  if (element.matches("math, .katex-display")) return "math";
  if (element.matches("h1, h2, h3, h4, h5, h6")) return "heading";
  if (element.matches("ul, ol")) return "list";
  if (element.matches("blockquote")) return "quote";
  if (element.matches('[role="alert"], [role="note"]')) return "notice";
  return "paragraph";
}

function hasMeaningfulContent(element: HTMLElement): boolean {
  return (
    Boolean(element.textContent?.replace(/\s+/g, " ").trim()) ||
    Boolean(element.querySelector("img, svg, canvas, table, pre, math, .katex")) ||
    element.matches("img, table, pre, math, .katex-display")
  );
}

function compareDocumentOrder(left: HTMLElement, right: HTMLElement): number {
  if (left === right) return 0;
  return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * Finds semantic reading units without wrapping or rewriting sanitized response markup.
 * IDs are stable for an unchanged normalized response and scoped by its response identifier.
 */
export function discoverReadingBlocks(root: HTMLElement): ReadingBlockEntry[] {
  const roots = Array.from(
    root.querySelectorAll<HTMLElement>(
      ".rb-content--document[data-rb-response-id], .rb-content--focus[data-rb-response-id]",
    ),
  );
  const entries: ReadingBlockEntry[] = [];

  for (const responseRoot of roots) {
    const responseId = responseRoot.dataset.rbResponseId ?? "response";
    const sectionId =
      responseRoot.closest<HTMLElement>("[data-rb-section-id]")?.dataset.rbSectionId ?? responseId;
    const normalized = new Set<HTMLElement>();
    for (const candidate of responseRoot.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR)) {
      if (candidate.closest(EXCLUDED_ANCESTOR_SELECTOR)) continue;
      const unit = readingUnit(candidate);
      if (!responseRoot.contains(unit) || !hasMeaningfulContent(unit)) continue;
      normalized.add(unit);
    }

    const units = [...normalized]
      .filter(
        (unit) =>
          ![...normalized].some(
            (possibleParent) => possibleParent !== unit && possibleParent.contains(unit),
          ),
      )
      .sort(compareDocumentOrder);
    const occurrences = new Map<string, number>();
    for (const element of units) {
      const kind = readingBlockKind(element);
      const signature = blockSignature(element, kind);
      const occurrence = occurrences.get(signature) ?? 0;
      occurrences.set(signature, occurrence + 1);
      entries.push({
        id: `rb-reading-${safeIdPart(responseId)}-${signature}-${occurrence}`,
        responseId,
        sectionId,
        kind,
        order: entries.length,
        element,
      });
    }
  }

  return entries;
}

export function applyReadingBlockMetadata(entries: readonly ReadingBlockEntry[]): () => void {
  for (const entry of entries) {
    entry.element.classList.add("rb-reading-block");
    entry.element.dataset.rbReadingBlockId = entry.id;
    entry.element.dataset.rbReadingBlockKind = entry.kind;
    if (!entry.element.hasAttribute("tabindex")) {
      entry.element.dataset.rbGuidedAddedTabindex = "true";
      entry.element.tabIndex = -1;
    }
  }
  return () => {
    for (const entry of entries) {
      entry.element.classList.remove("rb-reading-block");
      delete entry.element.dataset.rbReadingBlockId;
      delete entry.element.dataset.rbReadingBlockKind;
      delete entry.element.dataset.rbGuidedState;
      if (entry.element.dataset.rbGuidedAddedTabindex === "true") {
        entry.element.removeAttribute("tabindex");
        delete entry.element.dataset.rbGuidedAddedTabindex;
      }
    }
  };
}

export function nearestReadingBlock(
  entries: readonly ReadingBlockEntry[],
  scrollArea: HTMLElement,
  currentId: string | null,
): ReadingBlockEntry | null {
  if (entries.length === 0) return null;
  const rootRect = scrollArea.getBoundingClientRect();
  const focusLine = rootRect.top + rootRect.height * 0.42;
  const distance = (entry: ReadingBlockEntry): number => {
    const rect = entry.element.getBoundingClientRect();
    if (focusLine < rect.top) return rect.top - focusLine;
    if (focusLine > rect.bottom) return focusLine - rect.bottom;
    return 0;
  };
  const nearest = entries.reduce((best, entry) =>
    distance(entry) < distance(best) ? entry : best,
  );
  const current = entries.find((entry) => entry.id === currentId);
  if (!current) return nearest;

  // Keep the current block until another block is meaningfully closer. This small
  // hysteresis prevents adjacent blocks from alternating around the focus line.
  return distance(current) <= distance(nearest) + 24 ? current : nearest;
}

export function setReadingBlockStates(
  entries: readonly ReadingBlockEntry[],
  activeId: string | null,
): void {
  const activeIndex = entries.findIndex((entry) => entry.id === activeId);
  entries.forEach((entry, index) => {
    entry.element.dataset.rbGuidedState =
      index === activeIndex ? "active" : Math.abs(index - activeIndex) <= 1 ? "nearby" : "distant";
  });
}
