import { clampStickerRatio } from "../../shared/stickers";

export const STICKER_PIN_SIZE = 40;
export const STICKER_PIN_GAP = 8;
export const STICKER_DEFAULT_SAFE_TOP = 88;
export const STICKER_EXPANDED_ESTIMATED_HEIGHT = 220;

export interface StickerMarginItem {
  readonly id: string;
  readonly yRatio: number;
  readonly isPinned: boolean;
  readonly isExpanded: boolean;
}

export interface StickerMarginPosition {
  readonly id: string;
  readonly top: number;
  readonly yRatio: number;
}

interface PositionedItem extends StickerMarginItem {
  size: number;
  top: number;
}

export function stickerTopFromRatio(yRatio: number, sectionHeight: number): number {
  return clampStickerRatio(yRatio) * Math.max(sectionHeight - STICKER_PIN_SIZE, 0);
}

export function stickerRatioFromTop(top: number, sectionHeight: number): number {
  return clampStickerRatio(top / Math.max(sectionHeight - STICKER_PIN_SIZE, 1));
}

/**
 * Resolves section-relative Sticker positions without changing ownership. Pinned
 * positions are kept as close as possible to their stored ratio; automatic pins
 * stack below the measured section controls. A backwards pass keeps the group
 * inside the section when later pins would otherwise overflow its bottom edge.
 */
export function resolveStickerMarginPositions(
  items: readonly StickerMarginItem[],
  sectionHeight: number,
  safeTop: number,
): StickerMarginPosition[] {
  if (items.length === 0) {
    return [];
  }

  const height = Math.max(sectionHeight, STICKER_PIN_SIZE);
  const minimumTop = Math.min(Math.max(0, safeTop), height - STICKER_PIN_SIZE);
  let automaticIndex = 0;
  const positioned: PositionedItem[] = items.map((item) => {
    const size = item.isExpanded ? STICKER_EXPANDED_ESTIMATED_HEIGHT : STICKER_PIN_SIZE;
    const automaticTop = minimumTop + automaticIndex * (STICKER_PIN_SIZE + STICKER_PIN_GAP);
    if (!item.isPinned) {
      automaticIndex += 1;
    }
    const desiredTop = item.isPinned ? stickerTopFromRatio(item.yRatio, height) : automaticTop;
    return {
      ...item,
      size,
      top: Math.min(Math.max(minimumTop, desiredTop), Math.max(minimumTop, height - size)),
    };
  });

  positioned.sort((left, right) => left.top - right.top || left.id.localeCompare(right.id));
  for (let index = 1; index < positioned.length; index += 1) {
    const previous = positioned[index - 1];
    positioned[index].top = Math.max(
      positioned[index].top,
      previous.top + previous.size + STICKER_PIN_GAP,
    );
  }

  const last = positioned.at(-1)!;
  if (last.top + last.size > height) {
    last.top = Math.max(minimumTop, height - last.size);
    for (let index = positioned.length - 2; index >= 0; index -= 1) {
      const next = positioned[index + 1];
      positioned[index].top = Math.min(
        positioned[index].top,
        next.top - STICKER_PIN_GAP - positioned[index].size,
      );
    }
  }

  // A very short section cannot physically contain an unlimited number of pins.
  // Prefer the protected header boundary and a non-overlapping stack in that case.
  if (positioned[0].top < minimumTop) {
    positioned[0].top = minimumTop;
    for (let index = 1; index < positioned.length; index += 1) {
      const previous = positioned[index - 1];
      positioned[index].top = previous.top + previous.size + STICKER_PIN_GAP;
    }
  }

  return positioned.map((item) => ({
    id: item.id,
    top: item.top,
    yRatio: stickerRatioFromTop(item.top, height),
  }));
}
