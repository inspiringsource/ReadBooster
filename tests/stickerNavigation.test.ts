import { describe, expect, it } from "vitest";

import {
  classifyStickerViewport,
  orderStickerNavigationEntries,
  resolveStickerNavigation,
  type StickerNavigationEntry,
} from "../src/reader/stickers/stickerNavigationModel";

function entry(
  stickerId: string,
  sectionOrder: number,
  positionOrder: number,
  top: number,
  bottom = top + 40,
  createdAt = 100,
): StickerNavigationEntry {
  return {
    stickerId,
    sectionId: `section-${sectionOrder}`,
    sectionOrder,
    positionOrder,
    createdAt,
    top,
    bottom,
  };
}

describe("Sticker navigation model", () => {
  it("classifies only fully out-of-view Stickers beyond the visibility margin", () => {
    const viewport = { top: 100, bottom: 700 };
    expect(classifyStickerViewport(entry("above", 0, 0, 20, 100), viewport)).toBe("above");
    expect(classifyStickerViewport(entry("upper-edge", 0, 0, 45, 125), viewport)).toBe("visible");
    expect(classifyStickerViewport(entry("lower-edge", 0, 0, 675, 715), viewport)).toBe("visible");
    expect(classifyStickerViewport(entry("below", 0, 0, 680), viewport)).toBe("below");
  });

  it("orders by section, section-relative position, creation time, then stable ID", () => {
    const ordered = orderStickerNavigationEntries([
      entry("later-section", 2, 0.1, 900),
      entry("later-position", 1, 0.8, 600),
      entry("newer", 1, 0.2, 400, 440, 200),
      entry("older-b", 1, 0.2, 400, 440, 100),
      entry("older-a", 1, 0.2, 400, 440, 100),
    ]);
    expect(ordered.map(({ stickerId }) => stickerId)).toEqual([
      "older-a",
      "older-b",
      "newer",
      "later-position",
      "later-section",
    ]);
  });

  it("counts individual Stickers and chooses the nearest directional destinations", () => {
    const state = resolveStickerNavigation(
      [
        entry("above-first", 0, 0.1, -100, -60),
        entry("above-nearest", 0, 0.8, 20, 60),
        entry("visible", 1, 0.2, 250, 290),
        entry("below-nearest", 1, 0.7, 760, 800),
        entry("below-last", 2, 0.1, 1000, 1040),
      ],
      { top: 100, bottom: 700 },
    );
    expect(state.aboveCount).toBe(2);
    expect(state.belowCount).toBe(2);
    expect(state.nearestAbove?.stickerId).toBe("above-nearest");
    expect(state.nearestBelow?.stickerId).toBe("below-nearest");
  });

  it("returns no destination when all Stickers are visible", () => {
    const state = resolveStickerNavigation([entry("one", 0, 0.2, 180), entry("two", 0, 0.6, 520)], {
      top: 100,
      bottom: 700,
    });
    expect(state.aboveCount).toBe(0);
    expect(state.belowCount).toBe(0);
    expect(state.nearestAbove).toBeNull();
    expect(state.nearestBelow).toBeNull();
  });
});
