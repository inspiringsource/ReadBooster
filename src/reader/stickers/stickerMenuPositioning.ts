export const STICKER_MENU_VIEWPORT_MARGIN = 8;
export const STICKER_MENU_TRIGGER_GAP = 6;

export type StickerMenuPlacement = "above" | "below";

export interface StickerMenuPosition {
  left: number;
  placement: StickerMenuPlacement;
  top: number;
}

interface RectLike {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface SizeLike {
  height: number;
  width: number;
}

interface ViewportLike {
  height: number;
  width: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

/**
 * Positions the menu against the trigger in viewport coordinates. The menu
 * prefers the space below, flips above when needed, and is finally clamped so
 * browser zoom or a trigger near an edge cannot leave an action off-screen.
 */
export function calculateStickerMenuPosition(
  trigger: RectLike,
  menu: SizeLike,
  viewport: ViewportLike,
  margin = STICKER_MENU_VIEWPORT_MARGIN,
  gap = STICKER_MENU_TRIGGER_GAP,
): StickerMenuPosition {
  const belowTop = trigger.bottom + gap;
  const aboveTop = trigger.top - menu.height - gap;
  const hasRoomBelow = belowTop + menu.height <= viewport.height - margin;
  const placement: StickerMenuPlacement = hasRoomBelow ? "below" : "above";
  const preferredTop = placement === "below" ? belowTop : aboveTop;

  return {
    left: clamp(trigger.right - menu.width, margin, viewport.width - menu.width - margin),
    placement,
    top: clamp(preferredTop, margin, viewport.height - menu.height - margin),
  };
}
