import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const expectedSizes = { 16: 16, 32: 32, 48: 48, 128: 128 };

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
assert(JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]), "permissions changed");
assert(
  JSON.stringify(manifest.host_permissions) ===
    JSON.stringify(["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"]),
  "host permissions changed",
);
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

const textExtensions = new Set([".css", ".html", ".js", ".json", ".webmanifest"]);
const shippedText = readdirSync(dist, { recursive: true })
  .map((entry) => join(dist, String(entry)))
  .filter((entry) => textExtensions.has(extname(entry)))
  .map((entry) => readFileSync(entry, "utf8"))
  .join("\n");
assert(!/MyWebSite|MySite/.test(shippedText), "generic website placeholder metadata was shipped");
