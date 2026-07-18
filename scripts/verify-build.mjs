/* global process */

import { Buffer } from "node:buffer";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedSizes = { 16: 16, 32: 32, 48: 48, 128: 128 };
const expectedHosts = ["https://chatgpt.com/*", "https://gemini.google.com/*"];
const expectedDescription = "Turn AI conversations into readable, navigable documents.";
const expectedHomepage = "https://inspiringsource.github.io/ReadBooster/";
const expectedFirefoxId = "contact@avicloud.ch";
const expectedFirefoxMinimum = "142.0";
const fastReadingFontPath = "fonts/Fast_Sans.ttf";

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Build verification failed: ${message}`);
  }
}

function pngDimensions(file) {
  const buffer = readFileSync(file);
  assert(buffer.subarray(1, 4).toString("ascii") === "PNG", `${file} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function verifyBuild({ target = "chrome", dist = join(root, "dist") } = {}) {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
  const thirdPartyNoticesPath = join(dist, "THIRD_PARTY_NOTICES.md");

  assert(manifest.version === packageJson.version, "manifest version does not match package.json");
  assert(manifest.version === "0.5.3", "release version is not 0.5.3");
  assert(manifest.name === "ReadBooster", "extension name changed");
  assert(manifest.description === expectedDescription, "store description changed");
  assert(manifest.homepage_url === expectedHomepage, "homepage URL changed");
  assert(
    JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]),
    "permissions changed",
  );
  assert(
    JSON.stringify(manifest.host_permissions) === JSON.stringify(expectedHosts),
    "host permissions changed",
  );
  assert(manifest.content_scripts?.length === 1, "expected one content script declaration");
  assert(
    JSON.stringify(manifest.content_scripts[0].matches) === JSON.stringify(expectedHosts),
    "content-script matches changed",
  );
  assert(
    (manifest.web_accessible_resources?.length ?? 0) > 0,
    "expected generated web-accessible resources",
  );
  for (const resourceGroup of manifest.web_accessible_resources ?? []) {
    assert(
      JSON.stringify(resourceGroup.matches) === JSON.stringify(expectedHosts),
      "web-accessible-resource matches changed",
    );
    for (const resource of resourceGroup.resources ?? []) {
      assert(!resource.includes("*"), `web-accessible resource is too broad: ${resource}`);
      assert(existsSync(join(dist, resource)), `web-accessible resource is missing: ${resource}`);
    }
  }
  assert(
    manifest.web_accessible_resources.some((group) =>
      group.resources?.includes(fastReadingFontPath),
    ),
    "Fast Reading font is not declared as a web-accessible resource",
  );
  const fastReadingFont = join(dist, fastReadingFontPath);
  assert(existsSync(fastReadingFont), "Fast Reading font was not copied to dist");
  const fastReadingFontBuffer = readFileSync(fastReadingFont);
  assert(
    fastReadingFontBuffer.subarray(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00])),
    "Fast Reading font is not a TrueType sfnt",
  );
  assert(fastReadingFontBuffer.length > 1_000_000, "Fast Reading font asset is unexpectedly small");
  assert(existsSync(thirdPartyNoticesPath), "third-party notices were not copied to dist");
  const thirdPartyNotices = readFileSync(thirdPartyNoticesPath, "utf8");
  assert(/Fast Font/.test(thirdPartyNotices), "Fast Font attribution is missing");
  assert(
    /Copyright \(c\) 2023 Born2Root/.test(thirdPartyNotices),
    "Fast Font copyright is missing",
  );
  assert(/MIT License/.test(thirdPartyNotices), "Fast Font MIT license is missing");
  const manifestText = JSON.stringify(manifest);
  assert(
    !/claude\.ai|mistral\.ai|<all_urls>/i.test(manifestText),
    "unused host access was shipped",
  );
  assert(
    !/(?:activeTab|tabs|scripting|webRequest)/.test(JSON.stringify(manifest.permissions)),
    "an unnecessary Chrome permission was shipped",
  );
  assert(!("update_url" in manifest), "an update URL was added");
  if (target === "firefox") {
    const gecko = manifest.browser_specific_settings?.gecko;
    assert(gecko?.id === expectedFirefoxId, "Firefox Gecko ID changed");
    assert(gecko?.strict_min_version === expectedFirefoxMinimum, "Firefox minimum version changed");
    assert(
      JSON.stringify(gecko?.data_collection_permissions) === JSON.stringify({ required: ["none"] }),
      "Firefox data-collection declaration changed",
    );
  } else {
    assert(
      !("browser_specific_settings" in manifest),
      "Chrome build contains Firefox-specific settings",
    );
  }
  assert(manifest.icons && typeof manifest.icons === "object", "manifest icons are missing");
  assert(
    manifest.action?.default_icon && typeof manifest.action.default_icon === "object",
    "action.default_icon is missing",
  );

  for (const [size, expected] of Object.entries(expectedSizes)) {
    const iconPath = manifest.icons[size];
    assert(typeof iconPath === "string", `manifest icon ${size} is missing`);
    assert(extname(iconPath).toLowerCase() === ".png", `manifest icon ${size} is not PNG`);
    const outputPath = join(dist, iconPath);
    assert(existsSync(outputPath), `manifest icon ${size} was not copied to dist`);
    const dimensions = pngDimensions(outputPath);
    assert(
      dimensions.width === expected && dimensions.height === expected,
      `manifest icon ${size} has dimensions ${dimensions.width}x${dimensions.height}`,
    );
  }

  for (const size of ["16", "32"]) {
    assert(
      manifest.action.default_icon[size] === manifest.icons[size],
      `action.default_icon ${size} does not reuse the declared extension icon`,
    );
  }

  const shippedEntries = readdirSync(dist, { recursive: true }).map((entry) => String(entry));
  assert(
    shippedEntries.every((entry) => !/(?:^|\/)(?:\.DS_Store|__MACOSX)(?:\/|$)/.test(entry)),
    "macOS metadata was shipped",
  );
  const textExtensions = new Set([".css", ".html", ".js", ".json", ".webmanifest"]);
  const shippedText = shippedEntries
    .map((entry) => join(dist, entry))
    .filter((entry) => textExtensions.has(extname(entry)))
    .map((entry) => readFileSync(entry, "utf8"))
    .join("\n");
  assert(
    /font-family:\s*["']ReadBooster Fast Sans["'][\s\S]*font-weight:\s*400/.test(shippedText),
    "built Fast Reading face is not declared at weight 400",
  );
  assert(
    !/font-weight:\s*100\s+900/.test(shippedText),
    "built Fast Reading face was incorrectly declared as variable",
  );
  assert(
    /font-feature-settings:\s*["']calt["']\s*1/.test(shippedText) &&
      /font-variant-ligatures:\s*contextual/.test(shippedText),
    "built Fast Reading contextual alternates are missing",
  );
  assert(
    /new FontFace\(/.test(shippedText) && /document\.fonts\.add\(/.test(shippedText),
    "built reader does not register Fast Sans with the document FontFaceSet",
  );
  assert(
    /data-reading-style/.test(shippedText) && !/data-reading-font/.test(shippedText),
    "built reader does not use the unified Reading style attribute",
  );
  assert(!/MyWebSite|MySite/.test(shippedText), "generic website placeholder metadata was shipped");
  assert(
    !/tally\.so\/widgets\/embed\.js|Tally\.openPopup/.test(shippedText),
    "remote Tally executable code was shipped",
  );
  assert(!/\beval\s*\(|new Function\s*\(/.test(shippedText), "dynamic executable code was shipped");

  return { manifest, dist, target };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetIndex = process.argv.indexOf("--target");
  const distIndex = process.argv.indexOf("--dist");
  verifyBuild({
    target: targetIndex >= 0 ? process.argv[targetIndex + 1] : "chrome",
    dist: resolve(distIndex >= 0 ? process.argv[distIndex + 1] : "dist"),
  });
}
