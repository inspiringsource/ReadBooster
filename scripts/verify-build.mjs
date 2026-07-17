import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const expectedSizes = { 16: 16, 32: 32, 48: 48, 128: 128 };
const expectedHosts = ["https://chatgpt.com/*", "https://gemini.google.com/*"];
const expectedDescription = "Turn AI conversations into readable, navigable documents.";
const expectedHomepage = "https://inspiringsource.github.io/ReadBooster/";

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

assert(manifest.version === packageJson.version, "manifest version does not match package.json");
assert(manifest.name === "ReadBooster", "extension name changed");
assert(manifest.description === expectedDescription, "store description changed");
assert(manifest.homepage_url === expectedHomepage, "homepage URL changed");
assert(JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]), "permissions changed");
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
}
const manifestText = JSON.stringify(manifest);
assert(!/claude\.ai|mistral\.ai|<all_urls>/i.test(manifestText), "unused host access was shipped");
assert(
  !/(?:activeTab|tabs|scripting|webRequest)/.test(JSON.stringify(manifest.permissions)),
  "an unnecessary Chrome permission was shipped",
);
assert(!("update_url" in manifest), "an update URL was added");
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
assert(!/MyWebSite|MySite/.test(shippedText), "generic website placeholder metadata was shipped");
assert(
  !/tally\.so\/widgets\/embed\.js|Tally\.openPopup/.test(shippedText),
  "remote Tally executable code was shipped",
);
