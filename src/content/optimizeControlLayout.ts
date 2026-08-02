export type OptimizeControlMode = "full" | "compact";
export type OptimizeControlPlacement = "side" | "above" | "viewport" | "anchor";

export interface LayoutRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface OptimizeControlPosition {
  top: number | null;
  right: number;
  placement: OptimizeControlPlacement;
}

export const CONTROL_EDGE_MARGIN = 18;
export const CONTROL_COMPOSER_GAP = 10;
export const CONTROL_FIT_SAFETY_MARGIN = 10;
export const CONTROL_MODE_HYSTERESIS = 20;
export const CONTROL_COMPACT_SIZE = 44;
export const CONTROL_FULL_WIDTH_FALLBACK = 164;

const COMPOSER_INPUT_SELECTOR = [
  "textarea:not([disabled])",
  '[contenteditable="true"]:not([aria-hidden="true"])',
  '[role="textbox"]:not([aria-hidden="true"])',
].join(",");

const COMPOSER_CONTROL_SELECTOR = [
  "button",
  "select",
  'input[type="file"]',
  '[role="button"]',
].join(",");

function finiteRect(rect: DOMRect | LayoutRect): LayoutRect | null {
  const values = [rect.top, rect.right, rect.bottom, rect.left, rect.width, rect.height];
  return values.every(Number.isFinite) && rect.width > 0 && rect.height > 0
    ? {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    : null;
}

function isUsableComposerInput(element: HTMLElement, viewportHeight: number): boolean {
  if (element.closest("#readbooster-control-root, #readbooster-reader-root")) {
    return false;
  }
  const rect = finiteRect(element.getBoundingClientRect());
  if (!rect || rect.width < 120 || rect.height < 20) {
    return false;
  }
  return rect.bottom >= viewportHeight * 0.55 && rect.top < viewportHeight;
}

function composerBoundary(input: HTMLElement): HTMLElement {
  const inputRect = finiteRect(input.getBoundingClientRect());
  if (!inputRect) {
    return input;
  }

  let current = input.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    if (current === input.ownerDocument.body || current === input.ownerDocument.documentElement) {
      break;
    }
    const rect = finiteRect(current.getBoundingClientRect());
    if (!rect) {
      continue;
    }
    const remainsComposerSized =
      rect.height <= Math.max(260, inputRect.height * 4) &&
      rect.bottom >= inputRect.bottom - 8 &&
      rect.bottom <= inputRect.bottom + 120;
    if (rect.width < inputRect.width || !remainsComposerSized) {
      continue;
    }
    if (current.querySelector(COMPOSER_CONTROL_SELECTOR)) {
      return current;
    }
  }
  return input;
}

/** Finds one visible bottom-page composer without depending on provider-specific classes. */
export function findComposerBoundary(doc: Document): HTMLElement | null {
  const view = doc.defaultView;
  const viewportHeight = view?.innerHeight ?? doc.documentElement.clientHeight;
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(COMPOSER_INPUT_SELECTOR)).filter(
    (element) => isUsableComposerInput(element, viewportHeight),
  );
  const selected = candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    return rightRect.width - leftRect.width || rightRect.bottom - leftRect.bottom;
  })[0];
  return selected ? composerBoundary(selected) : null;
}

export function availableSideSpace(viewportWidth: number, composer: LayoutRect | null): number {
  return composer
    ? Math.max(0, viewportWidth - CONTROL_EDGE_MARGIN - composer.right)
    : Math.max(0, viewportWidth - CONTROL_EDGE_MARGIN * 2);
}

/** Uses distinct enter/exit thresholds so a fractional-pixel boundary cannot flicker. */
export function resolveOptimizeControlMode(
  availableWidth: number,
  fullWidth: number,
  currentMode: OptimizeControlMode,
): OptimizeControlMode {
  const fullRequirement = fullWidth + CONTROL_FIT_SAFETY_MARGIN;
  if (currentMode === "compact") {
    return availableWidth >= fullRequirement + CONTROL_MODE_HYSTERESIS ? "full" : "compact";
  }
  return availableWidth < fullRequirement ? "compact" : "full";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function positionOptimizeControl({
  viewportWidth,
  viewportHeight,
  controlWidth,
  controlHeight,
  composer,
}: {
  viewportWidth: number;
  viewportHeight: number;
  controlWidth: number;
  controlHeight: number;
  composer: LayoutRect | null;
}): OptimizeControlPosition {
  if (!composer) {
    return { top: null, right: CONTROL_EDGE_MARGIN, placement: "viewport" };
  }

  const sideSpace = availableSideSpace(viewportWidth, composer);
  if (sideSpace >= controlWidth + CONTROL_FIT_SAFETY_MARGIN) {
    return {
      top: clamp(
        composer.top + (composer.height - controlHeight) / 2,
        CONTROL_EDGE_MARGIN,
        viewportHeight - controlHeight - CONTROL_EDGE_MARGIN,
      ),
      right: CONTROL_EDGE_MARGIN,
      placement: "side",
    };
  }

  const left = clamp(
    composer.right - controlWidth,
    CONTROL_EDGE_MARGIN,
    viewportWidth - controlWidth - CONTROL_EDGE_MARGIN,
  );
  return {
    top: clamp(
      composer.top - controlHeight - CONTROL_COMPOSER_GAP,
      CONTROL_EDGE_MARGIN,
      viewportHeight - controlHeight - CONTROL_EDGE_MARGIN,
    ),
    right: Math.max(CONTROL_EDGE_MARGIN, viewportWidth - left - controlWidth),
    placement: "above",
  };
}

export function readLayoutRect(element: Element | null): LayoutRect | null {
  return element ? finiteRect(element.getBoundingClientRect()) : null;
}
