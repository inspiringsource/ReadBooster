import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";
import { FAST_READING_FONT_PATH, READBOOSTER_CONTROL_ICON_PATH } from "../src/shared/assets";
import {
  ACTION_ICONS,
  createManifest,
  EXTENSION_ICONS,
  FIREFOX_EXTENSION_ID,
  FIREFOX_MINIMUM_VERSION,
  HOMEPAGE_URL,
  MANIFEST_DESCRIPTION,
  SUPPORTED_HOST_MATCHES,
} from "../src/manifest/manifest";

function pngDimensions(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("extension branding package", () => {
  it("uses package version 0.7.3 and keeps the exact store permission boundary", () => {
    const manifestSource = readFileSync("src/manifest/manifest.ts", "utf8");
    expect(packageJson.version).toBe("0.7.3");
    expect(manifestSource).toContain("version: packageJson.version");
    expect(manifestSource).toContain('permissions: ["storage"]');
    expect(manifestSource).not.toContain('permissions: ["storage",');
    expect(SUPPORTED_HOST_MATCHES).toEqual([
      "https://chatgpt.com/*",
      "https://gemini.google.com/*",
      "https://chat.mistral.ai/*",
      "https://claude.ai/*",
    ]);
    expect(MANIFEST_DESCRIPTION).toBe("Turn AI conversations into readable, navigable documents.");
    expect(MANIFEST_DESCRIPTION.length).toBeLessThanOrEqual(132);
    expect(HOMEPAGE_URL).toBe("https://inspiringsource.github.io/ReadBooster/");
    expect(manifestSource).not.toMatch(
      /https:\/\/mistral\.ai\/\*|<all_urls>|activeTab|\btabs\b|\bscripting\b|webRequest|update_url/,
    );
  });

  it("generates explicit and separate Chrome and Firefox manifests", () => {
    const chromeManifest = createManifest("chrome");
    const firefoxManifest = createManifest("firefox");

    expect(chromeManifest).not.toHaveProperty("browser_specific_settings");
    expect(firefoxManifest.browser_specific_settings).toEqual({
      gecko: {
        id: "contact@avicloud.ch",
        strict_min_version: "142.0",
        data_collection_permissions: { required: ["none"] },
      },
    });
    expect(FIREFOX_EXTENSION_ID).toBe("contact@avicloud.ch");
    expect(FIREFOX_MINIMUM_VERSION).toBe("142.0");
    expect(firefoxManifest.permissions).toEqual(chromeManifest.permissions);
    expect(firefoxManifest.host_permissions).toEqual(chromeManifest.host_permissions);
    expect(firefoxManifest.content_scripts).toEqual(chromeManifest.content_scripts);
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
    expect(READBOOSTER_CONTROL_ICON_PATH).toBe(EXTENSION_ICONS["32"]);
    expect(createManifest("chrome").web_accessible_resources[0].resources).toContain(
      READBOOSTER_CONTROL_ICON_PATH,
    );
  });

  it("ships the Fast Reading font as the only dedicated reader font asset", () => {
    const fontPath = `public/${FAST_READING_FONT_PATH}`;
    expect(existsSync(fontPath)).toBe(true);
    const font = readFileSync(fontPath);
    expect(font.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x01, 0x00, 0x00]));
    expect(font.length).toBeGreaterThan(1_000_000);
    expect(readFileSync("src/manifest/manifest.ts", "utf8")).toContain(
      "resources: [FAST_READING_FONT_PATH, READBOOSTER_CONTROL_ICON_PATH]",
    );
    expect(readFileSync("src/manifest/manifest.ts", "utf8")).toContain(
      "matches: [...SUPPORTED_HOST_MATCHES]",
    );
  });

  it("keeps corrected website assets outside the extension runtime package", () => {
    const websiteManifest = readFileSync("branding/website-favicon/site.webmanifest", "utf8");
    expect(existsSync("public/favicon")).toBe(false);
    expect(websiteManifest).toContain('"name": "ReadBooster"');
    expect(websiteManifest).not.toMatch(/MyWebSite|MySite/);
  });
});
