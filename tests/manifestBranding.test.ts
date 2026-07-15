import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import { ACTION_ICONS, EXTENSION_ICONS } from "../src/manifest/manifest";

function pngDimensions(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("extension branding package", () => {
  it("uses package version 0.4.2 and keeps the existing permission boundary", () => {
    const manifestSource = readFileSync("src/manifest/manifest.ts", "utf8");
    expect(packageJson.version).toBe("0.4.2");
    expect(manifestSource).toContain("version: packageJson.version");
    expect(manifestSource).toContain('permissions: ["storage"]');
    expect(manifestSource).not.toContain('permissions: ["storage",');
  });

  it("declares exact PNG icon sizes and action icons backed by runtime public assets", () => {
    expect(Object.keys(EXTENSION_ICONS)).toEqual(["16", "32", "48", "128"]);
    expect(ACTION_ICONS).toEqual({
      "16": EXTENSION_ICONS["16"],
      "32": EXTENSION_ICONS["32"],
    });

    for (const [size, path] of Object.entries(EXTENSION_ICONS)) {
      expect(path.endsWith(".png")).toBe(true);
      expect(path.endsWith(".svg")).toBe(false);
      const publicPath = `public/${path}`;
      expect(existsSync(publicPath)).toBe(true);
      expect(pngDimensions(publicPath)).toEqual({ width: Number(size), height: Number(size) });
    }
  });

  it("keeps corrected website assets outside the extension runtime package", () => {
    const websiteManifest = readFileSync("branding/website-favicon/site.webmanifest", "utf8");
    expect(existsSync("public/favicon")).toBe(false);
    expect(websiteManifest).toContain('"name": "ReadBooster"');
    expect(websiteManifest).not.toMatch(/MyWebSite|MySite/);
  });
});
