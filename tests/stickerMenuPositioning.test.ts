import { describe, expect, it } from "vitest";

import {
  STICKER_MENU_VIEWPORT_MARGIN,
  calculateStickerMenuPosition,
} from "../src/reader/stickers/stickerMenuPositioning";

describe("Sticker menu viewport positioning", () => {
  const menu = { width: 176, height: 190 };
  const viewport = { width: 1000, height: 800 };

  it("opens below the trigger when the full action list fits", () => {
    expect(
      calculateStickerMenuPosition(
        { top: 100, bottom: 128, left: 700, right: 728 },
        menu,
        viewport,
      ),
    ).toEqual({ left: 552, placement: "below", top: 134 });
  });

  it("flips above a trigger near the viewport bottom", () => {
    expect(
      calculateStickerMenuPosition(
        { top: 740, bottom: 768, left: 700, right: 728 },
        menu,
        viewport,
      ),
    ).toEqual({ left: 552, placement: "above", top: 544 });
  });

  it("keeps the menu inside both horizontal viewport edges", () => {
    expect(
      calculateStickerMenuPosition({ top: 100, bottom: 128, left: 0, right: 28 }, menu, viewport)
        .left,
    ).toBe(STICKER_MENU_VIEWPORT_MARGIN);
    expect(
      calculateStickerMenuPosition(
        { top: 100, bottom: 128, left: 990, right: 1018 },
        menu,
        viewport,
      ).left,
    ).toBe(816);
  });

  it("clamps the menu vertically when neither side has its preferred space", () => {
    expect(
      calculateStickerMenuPosition(
        { top: 60, bottom: 88, left: 400, right: 428 },
        { width: 176, height: 300 },
        { width: 600, height: 320 },
      ),
    ).toEqual({ left: 252, placement: "above", top: 8 });
  });
});
