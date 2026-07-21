export const STICKER_VIEWPORT_MARGIN = 24;

export type StickerViewportPosition = "above" | "visible" | "below";

export interface StickerNavigationEntry {
  stickerId: string;
  sectionId: string;
  sectionOrder: number;
  positionOrder: number;
  createdAt: number;
  top: number;
  bottom: number;
}

export interface StickerNavigationViewport {
  top: number;
  bottom: number;
}

export interface StickerNavigationState {
  ordered: readonly StickerNavigationEntry[];
  aboveCount: number;
  belowCount: number;
  nearestAbove: StickerNavigationEntry | null;
  nearestBelow: StickerNavigationEntry | null;
}

export function classifyStickerViewport(
  entry: Pick<StickerNavigationEntry, "top" | "bottom">,
  viewport: StickerNavigationViewport,
  margin = STICKER_VIEWPORT_MARGIN,
): StickerViewportPosition {
  if (entry.bottom < viewport.top + margin) {
    return "above";
  }
  if (entry.top > viewport.bottom - margin) {
    return "below";
  }
  return "visible";
}

export function orderStickerNavigationEntries(
  entries: readonly StickerNavigationEntry[],
): StickerNavigationEntry[] {
  return [...entries].sort(
    (left, right) =>
      left.sectionOrder - right.sectionOrder ||
      left.positionOrder - right.positionOrder ||
      left.createdAt - right.createdAt ||
      left.stickerId.localeCompare(right.stickerId),
  );
}

export function resolveStickerNavigation(
  entries: readonly StickerNavigationEntry[],
  viewport: StickerNavigationViewport,
  margin = STICKER_VIEWPORT_MARGIN,
): StickerNavigationState {
  const ordered = orderStickerNavigationEntries(entries);
  const above = ordered.filter(
    (entry) => classifyStickerViewport(entry, viewport, margin) === "above",
  );
  const below = ordered.filter(
    (entry) => classifyStickerViewport(entry, viewport, margin) === "below",
  );
  return {
    ordered,
    aboveCount: above.length,
    belowCount: below.length,
    nearestAbove: above.at(-1) ?? null,
    nearestBelow: below[0] ?? null,
  };
}
