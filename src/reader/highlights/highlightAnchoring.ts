import {
  HIGHLIGHT_CONTEXT_LENGTH,
  HIGHLIGHT_TEXT_MAX_LENGTH,
  type HighlightAnchor,
  type HighlightRecord,
} from "../../shared/highlights";

export const HIGHLIGHT_BLOCK_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption";

const EXCLUDED_SELECTOR = [
  "pre",
  "code",
  "kbd",
  "samp",
  "math",
  ".katex",
  ".MathJax",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-rb-control]",
  ".rb-block-toolbar",
  ".rb-table-toolbar",
  ".rb-document-block__header",
].join(", ");

export interface HighlightSelectionDraft extends HighlightAnchor {
  readonly sectionId: string;
  readonly responseId: string;
  readonly blockText: string;
  readonly rect: DOMRect;
}

export interface ResolvedHighlightAnchor {
  readonly block: HTMLElement;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly confidence: "exact" | "context";
}

function simpleHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedBlockText(element: HTMLElement): string {
  return element.textContent?.replace(/\r\n?/g, "\n") ?? "";
}

export function assignHighlightBlockIds(root: HTMLElement): HTMLElement[] {
  const occurrences = new Map<string, number>();
  return Array.from(root.querySelectorAll<HTMLElement>(HIGHLIGHT_BLOCK_SELECTOR)).filter(
    (block) => {
      if (block.closest(EXCLUDED_SELECTOR)) {
        return false;
      }
      const text = normalizedBlockText(block);
      if (!text.trim()) {
        return false;
      }
      const signature = `${block.tagName.toLowerCase()}:${simpleHash(text)}`;
      const occurrence = occurrences.get(signature) ?? 0;
      occurrences.set(signature, occurrence + 1);
      block.dataset.rbHighlightBlockId = `${signature}:${occurrence}`;
      return true;
    },
  );
}

function closestEligibleBlock(node: Node, root: HTMLElement): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  const block = element?.closest<HTMLElement>(HIGHLIGHT_BLOCK_SELECTOR) ?? null;
  if (!block || !root.contains(block) || block.closest(EXCLUDED_SELECTOR)) {
    return null;
  }
  return block;
}

function rangeOffset(block: HTMLElement, node: Node, offset: number): number | null {
  try {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

export function selectionToHighlightDraft(
  selection: Selection,
  readerRoot: HTMLElement,
): HighlightSelectionDraft | null {
  if (selection.rangeCount !== 1 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const responseRoot = closestEligibleBlock(range.commonAncestorContainer, readerRoot)?.closest(
    ".rb-content",
  );
  if (!(responseRoot instanceof HTMLElement)) {
    return null;
  }
  const startBlock = closestEligibleBlock(range.startContainer, responseRoot);
  const endBlock = closestEligibleBlock(range.endContainer, responseRoot);
  if (!startBlock || startBlock !== endBlock) {
    return null;
  }
  if (range.cloneContents().querySelector(EXCLUDED_SELECTOR)) {
    return null;
  }
  assignHighlightBlockIds(responseRoot);
  const section = responseRoot.closest<HTMLElement>("[data-rb-section-id]");
  const responseId = section?.dataset.rbResponseId;
  const sectionId = section?.dataset.rbSectionId;
  const blockId = startBlock.dataset.rbHighlightBlockId;
  if (!sectionId || !responseId || !blockId) {
    return null;
  }

  const firstOffset = rangeOffset(startBlock, range.startContainer, range.startOffset);
  const secondOffset = rangeOffset(startBlock, range.endContainer, range.endOffset);
  if (firstOffset === null || secondOffset === null) {
    return null;
  }
  const startOffset = Math.min(firstOffset, secondOffset);
  const endOffset = Math.max(firstOffset, secondOffset);
  const blockText = normalizedBlockText(startBlock);
  const selectedText = blockText.slice(startOffset, endOffset);
  if (!selectedText.trim() || selectedText.length > HIGHLIGHT_TEXT_MAX_LENGTH) {
    return null;
  }
  const rect = range.getBoundingClientRect();
  return {
    sectionId,
    responseId,
    blockId,
    blockText,
    selectedText,
    prefix: blockText.slice(Math.max(0, startOffset - HIGHLIGHT_CONTEXT_LENGTH), startOffset),
    suffix: blockText.slice(endOffset, endOffset + HIGHLIGHT_CONTEXT_LENGTH),
    startOffset,
    endOffset,
    rect,
  };
}

function contextMatches(text: string, start: number, highlight: HighlightRecord): boolean {
  const end = start + highlight.selectedText.length;
  const prefix = text.slice(Math.max(0, start - highlight.prefix.length), start);
  const suffix = text.slice(end, end + highlight.suffix.length);
  return prefix === highlight.prefix && suffix === highlight.suffix;
}

function occurrenceOffsets(text: string, selectedText: string): number[] {
  const offsets: number[] = [];
  let from = 0;
  while (from <= text.length - selectedText.length) {
    const index = text.indexOf(selectedText, from);
    if (index < 0) {
      break;
    }
    offsets.push(index);
    from = index + Math.max(1, selectedText.length);
  }
  return offsets;
}

export function resolveHighlightAnchor(
  root: HTMLElement,
  highlight: HighlightRecord,
): ResolvedHighlightAnchor | null {
  const blocks = assignHighlightBlockIds(root);
  const preferred = blocks.find((block) => block.dataset.rbHighlightBlockId === highlight.blockId);
  if (preferred) {
    const text = normalizedBlockText(preferred);
    if (
      text.slice(highlight.startOffset, highlight.endOffset) === highlight.selectedText &&
      contextMatches(text, highlight.startOffset, highlight)
    ) {
      return {
        block: preferred,
        startOffset: highlight.startOffset,
        endOffset: highlight.endOffset,
        confidence: "exact",
      };
    }
    const contextual = occurrenceOffsets(text, highlight.selectedText).filter((offset) =>
      contextMatches(text, offset, highlight),
    );
    if (contextual.length === 1) {
      return {
        block: preferred,
        startOffset: contextual[0],
        endOffset: contextual[0] + highlight.selectedText.length,
        confidence: "context",
      };
    }
  }

  const matches = blocks.flatMap((block) => {
    const text = normalizedBlockText(block);
    return occurrenceOffsets(text, highlight.selectedText)
      .filter((offset) => contextMatches(text, offset, highlight))
      .map((offset) => ({ block, offset }));
  });
  if (matches.length !== 1) {
    return null;
  }
  return {
    block: matches[0].block,
    startOffset: matches[0].offset,
    endOffset: matches[0].offset + highlight.selectedText.length,
    confidence: "context",
  };
}

function textNodes(block: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(EXCLUDED_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function wrapResolvedAnchor(resolved: ResolvedHighlightAnchor, highlight: HighlightRecord): void {
  let offset = 0;
  let first = true;
  for (const node of textNodes(resolved.block)) {
    const length = node.data.length;
    const nodeStart = offset;
    const nodeEnd = offset + length;
    offset = nodeEnd;
    const start = Math.max(resolved.startOffset, nodeStart);
    const end = Math.min(resolved.endOffset, nodeEnd);
    if (start >= end) {
      continue;
    }
    const range = document.createRange();
    range.setStart(node, start - nodeStart);
    range.setEnd(node, end - nodeStart);
    const mark = document.createElement("mark");
    mark.className = `rb-highlight rb-highlight--${highlight.style}`;
    mark.dataset.rbHighlightId = highlight.id;
    mark.dataset.rbHighlightStyle = highlight.style;
    mark.setAttribute("aria-label", `${highlight.style} highlighted passage`);
    mark.setAttribute("role", "button");
    mark.tabIndex = first ? 0 : -1;
    range.surroundContents(mark);
    first = false;
  }
}

function unwrapHighlights(root: HTMLElement): void {
  for (const mark of root.querySelectorAll<HTMLElement>("mark[data-rb-highlight-id]")) {
    mark.replaceWith(...Array.from(mark.childNodes));
  }
  for (const block of root.querySelectorAll<HTMLElement>("[data-rb-highlight-block-id]")) {
    delete block.dataset.rbHighlightBlockId;
  }
  root.normalize();
}

export function renderHighlights(
  root: HTMLElement,
  highlights: readonly HighlightRecord[],
  onActivate: (highlightId: string, target: HTMLElement) => void,
): { readonly resolvedIds: ReadonlySet<string>; cleanup: () => void } {
  unwrapHighlights(root);
  if (highlights.length === 0) {
    return { resolvedIds: new Set(), cleanup: () => undefined };
  }
  assignHighlightBlockIds(root);
  const resolved = highlights.flatMap((highlight) => {
    const anchor = resolveHighlightAnchor(root, highlight);
    return anchor ? [{ highlight, anchor }] : [];
  });
  resolved
    .sort((left, right) => right.anchor.startOffset - left.anchor.startOffset)
    .forEach(({ highlight, anchor }) => wrapResolvedAnchor(anchor, highlight));

  const handleActivate = (event: Event): void => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("mark[data-rb-highlight-id]")
        : null;
    if (!target || !root.contains(target)) {
      return;
    }
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") {
      return;
    }
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }
    const highlightId = target.dataset.rbHighlightId;
    if (highlightId) {
      onActivate(highlightId, target);
    }
  };
  root.addEventListener("click", handleActivate);
  root.addEventListener("keydown", handleActivate);
  return {
    resolvedIds: new Set(resolved.map(({ highlight }) => highlight.id)),
    cleanup: () => {
      root.removeEventListener("click", handleActivate);
      root.removeEventListener("keydown", handleActivate);
      unwrapHighlights(root);
    },
  };
}
