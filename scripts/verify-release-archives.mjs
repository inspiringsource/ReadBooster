/* global console */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yauzl from "yauzl";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = join(root, "release");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const forbidden =
  /(?:^|\/)(?:\.git|\.pwdnote\.enc|node_modules|coverage|\.DS_Store|__MACOSX)(?:\/|$)/;

function openZip(path) {
  return new Promise((resolveZip, rejectZip) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) =>
      error || !zip ? rejectZip(error ?? new Error(`Unable to open ${path}`)) : resolveZip(zip),
    );
  });
}

async function inspectZip(path) {
  const zip = await openZip(path);
  return new Promise((resolveEntries, rejectEntries) => {
    const entries = [];
    const contents = new Map();
    zip.on("entry", (entry) => {
      entries.push(entry.fileName);
      if (entry.fileName === "manifest.json" || entry.fileName === "package.json") {
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            rejectEntries(error ?? new Error(`Unable to read ${entry.fileName}`));
            return;
          }
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            contents.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
          stream.on("error", rejectEntries);
        });
      } else {
        zip.readEntry();
      }
    });
    zip.on("end", () => resolveEntries({ entries, contents }));
    zip.on("error", rejectEntries);
    zip.readEntry();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Archive verification failed: ${message}`);
  }
}

for (const target of ["chrome", "firefox"]) {
  const archive = join(releaseDir, `readbooster-${target}-${version}.zip`);
  const { entries, contents } = await inspectZip(archive);
  assert(entries.includes("manifest.json"), `${target} manifest is not at ZIP root`);
  assert(
    !entries.some((entry) => entry.startsWith(`dist-${target}/`)),
    `${target} has wrapper dir`,
  );
  assert(!entries.some((entry) => forbidden.test(entry)), `${target} contains forbidden files`);
  assert(
    entries.every((entry) =>
      /^(?:assets|fonts|icons|src)(?:\/|$)|^(?:LICENSE|NOTICE\.md|manifest\.json|THIRD_PARTY_NOTICES\.md)$/.test(
        entry,
      ),
    ),
    `${target} contains repository or development files`,
  );
  const manifest = JSON.parse(contents.get("manifest.json"));
  assert(manifest.version === version, `${target} version mismatch`);
  if (target === "firefox") {
    assert(
      manifest.browser_specific_settings?.gecko?.id === "contact@avicloud.ch",
      "Firefox Gecko ID mismatch",
    );
  } else {
    assert(!manifest.browser_specific_settings, "Chrome ZIP contains Gecko settings");
  }
}

const sourceArchive = join(releaseDir, `readbooster-source-${version}.zip`);
const { entries: sourceEntries, contents: sourceContents } = await inspectZip(sourceArchive);
for (const required of [
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE.md",
  "SECURITY.md",
  "package.json",
  "package-lock.json",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "eslint.config.js",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
  "docs/firefox-listing-draft.md",
  "docs/adding-a-platform.md",
  "docs/repository-audit-0.7.0.md",
  "docs/repository-maintenance.md",
  "docs/firefox-submission.md",
  "docs/release-builds.md",
  "public/fonts/Fast_Sans.ttf",
  "src/manifest/manifest.ts",
  "scripts/build.mjs",
  "tests/setup.ts",
  ".github/ISSUE_TEMPLATE/platform_support.yml",
  ".github/pull_request_template.md",
]) {
  assert(sourceEntries.includes(required), `source ZIP is missing ${required}`);
}
assert(
  !sourceEntries.some((entry) => forbidden.test(entry)),
  "source ZIP contains forbidden files",
);
assert(
  !sourceEntries.some((entry) => /^(?:dist(?:-chrome|-firefox)?|release)\//.test(entry)),
  "source ZIP contains generated release output",
);
assert(
  JSON.parse(sourceContents.get("package.json")).version === version,
  "source version mismatch",
);

const checksumLines = (await readFile(join(releaseDir, "SHA256SUMS.txt"), "utf8"))
  .trim()
  .split("\n");
assert(checksumLines.length === 3, "checksum file must contain exactly three entries");
const expectedArchiveNames = ["chrome", "firefox", "source"].map(
  (target) => `readbooster-${target}-${version}.zip`,
);
const expectedReleaseEntries = [...expectedArchiveNames, "SHA256SUMS.txt"].sort();
assert(
  JSON.stringify((await readdir(releaseDir)).sort()) === JSON.stringify(expectedReleaseEntries),
  "release directory contains unexpected files",
);
for (const [index, archiveName] of expectedArchiveNames.entries()) {
  const archiveContents = await readFile(join(releaseDir, archiveName));
  const expectedHash = createHash("sha256").update(archiveContents).digest("hex");
  assert(
    checksumLines[index] === `${expectedHash}  ${archiveName}`,
    `checksum mismatch for ${archiveName}`,
  );
}

console.log("Chrome, Firefox, source archives, and checksums verified.");
