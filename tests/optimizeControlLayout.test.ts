import { describe, expect, it } from "vitest";

import {
  availableSideSpace,
  CONTROL_COMPACT_SIZE,
  CONTROL_EDGE_MARGIN,
  CONTROL_FIT_SAFETY_MARGIN,
  CONTROL_MODE_HYSTERESIS,
  positionOptimizeControl,
  resolveOptimizeControlMode,
  type LayoutRect,
} from "../src/content/optimizeControlLayout";

const composer: LayoutRect = {
  top: 700,
  right: 820,
  bottom: 780,
  left: 220,
  width: 600,
  height: 80,
};

describe("Optimize Reading control layout", () => {
  it("uses actual composer-side space rather than a viewport breakpoint", () => {
    expect(availableSideSpace(1200, composer)).toBe(1200 - CONTROL_EDGE_MARGIN - 820);
    expect(resolveOptimizeControlMode(362, 164, "full")).toBe("full");
    expect(resolveOptimizeControlMode(120, 164, "full")).toBe("compact");
  });

  it("uses hysteresis before returning from compact to full", () => {
    const compactThreshold = 164 + CONTROL_FIT_SAFETY_MARGIN;
    const restoreThreshold = compactThreshold + CONTROL_MODE_HYSTERESIS;
    expect(resolveOptimizeControlMode(compactThreshold - 1, 164, "full")).toBe("compact");
    expect(resolveOptimizeControlMode(compactThreshold + 1, 164, "compact")).toBe("compact");
    expect(resolveOptimizeControlMode(restoreThreshold - 1, 164, "compact")).toBe("compact");
    expect(resolveOptimizeControlMode(restoreThreshold + 1, 164, "compact")).toBe("full");
  });

  it("aligns beside the composer when the selected control fits", () => {
    expect(
      positionOptimizeControl({
        viewportWidth: 1200,
        viewportHeight: 900,
        controlWidth: 164,
        controlHeight: 44,
        composer,
      }),
    ).toEqual({ top: 718, right: CONTROL_EDGE_MARGIN, placement: "side" });
  });

  it("places a compact control above the composer when the side gap is unsafe", () => {
    const crowded = { ...composer, right: 1170, left: 570 };
    const result = positionOptimizeControl({
      viewportWidth: 1200,
      viewportHeight: 900,
      controlWidth: CONTROL_COMPACT_SIZE,
      controlHeight: CONTROL_COMPACT_SIZE,
      composer: crowded,
    });
    expect(result).toEqual({ top: 646, right: 30, placement: "above" });
  });

  it("keeps the fallback control inside a narrow viewport", () => {
    const result = positionOptimizeControl({
      viewportWidth: 320,
      viewportHeight: 480,
      controlWidth: CONTROL_COMPACT_SIZE,
      controlHeight: CONTROL_COMPACT_SIZE,
      composer: { top: 30, right: 315, bottom: 90, left: 5, width: 310, height: 60 },
    });
    expect(result.top).toBe(CONTROL_EDGE_MARGIN);
    expect(result.right).toBeGreaterThanOrEqual(CONTROL_EDGE_MARGIN);
  });
});
