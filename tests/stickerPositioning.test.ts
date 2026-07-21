import { describe, expect, it } from "vitest";

import {
  STICKER_PIN_GAP,
  STICKER_PIN_SIZE,
  resolveStickerMarginPositions,
  stickerRatioFromTop,
  stickerTopFromRatio,
} from "../src/reader/stickers/stickerPositioning";

describe("Sticker margin positioning", () => {
  it("places automatic pins below section controls with non-overlapping spacing", () => {
    const positions = resolveStickerMarginPositions(
      [
        { id: "one", yRatio: 0, isPinned: false, isExpanded: false },
        { id: "two", yRatio: 0, isPinned: false, isExpanded: false },
        { id: "three", yRatio: 0, isPinned: false, isExpanded: false },
      ],
      600,
      104,
    );

    expect(positions.map((position) => position.top)).toEqual([104, 152, 200]);
    expect(positions[1].top - positions[0].top).toBe(STICKER_PIN_SIZE + STICKER_PIN_GAP);
  });

  it("respects pinned ratios while resolving collisions predictably", () => {
    const positions = resolveStickerMarginPositions(
      [
        { id: "one", yRatio: 0.5, isPinned: true, isExpanded: false },
        { id: "two", yRatio: 0.5, isPinned: true, isExpanded: false },
        { id: "three", yRatio: 0.51, isPinned: true, isExpanded: false },
      ],
      700,
      96,
    );

    expect(positions[1].top - positions[0].top).toBeGreaterThanOrEqual(48);
    expect(positions[2].top - positions[1].top).toBeGreaterThanOrEqual(48);
    expect(positions.every((position) => position.top >= 96 && position.top <= 660)).toBe(true);
  });

  it("keeps an expanded card separated from collapsed pins", () => {
    const positions = resolveStickerMarginPositions(
      [
        { id: "expanded", yRatio: 0.2, isPinned: true, isExpanded: true },
        { id: "collapsed", yRatio: 0.21, isPinned: true, isExpanded: false },
      ],
      700,
      88,
    );

    expect(positions[1].top - positions[0].top).toBeGreaterThanOrEqual(228);
  });

  it("converts positions to section-relative ratios and clamps invalid bounds", () => {
    expect(stickerRatioFromTop(280, 600)).toBe(0.5);
    expect(stickerTopFromRatio(0.5, 600)).toBe(280);
    expect(stickerRatioFromTop(-50, 600)).toBe(0);
    expect(stickerRatioFromTop(900, 600)).toBe(1);
  });
});
