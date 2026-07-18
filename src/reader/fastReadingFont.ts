import { FAST_READING_FONT_PATH } from "../shared/assets";

export const FAST_READING_FONT_FAMILY = "ReadBooster Fast Sans";

export function extensionAssetUrl(path: string): string {
  try {
    if (typeof chrome !== "undefined" && typeof chrome.runtime?.getURL === "function") {
      return chrome.runtime.getURL(path);
    }
  } catch {
    // Unit tests and local browser fixtures intentionally use the stable fallback.
  }
  return path;
}

export function fastReadingFontFace(assetUrl = extensionAssetUrl(FAST_READING_FONT_PATH)): string {
  return `@font-face {
    font-family: "ReadBooster Fast Sans";
    src: url("${assetUrl}") format("truetype");
    font-display: swap;
    font-style: normal;
    font-weight: 400;
  }`;
}

/**
 * Chromium does not register an @font-face declared only inside the reader's
 * ShadowRoot in the document FontFaceSet. Register the local extension asset
 * explicitly so readable descendants use the face instead of a silent fallback.
 */
export function registerFastReadingFont(
  assetUrl = extensionAssetUrl(FAST_READING_FONT_PATH),
): FontFace | null {
  if (
    typeof FontFace !== "function" ||
    typeof document === "undefined" ||
    typeof document.fonts?.add !== "function"
  ) {
    return null;
  }

  const face = new FontFace(FAST_READING_FONT_FAMILY, `url("${assetUrl}")`, {
    display: "swap",
    style: "normal",
    weight: "400",
  });
  document.fonts.add(face);
  return face;
}

export function unregisterFastReadingFont(face: FontFace | null): void {
  if (face && typeof document !== "undefined") {
    document.fonts?.delete(face);
  }
}
