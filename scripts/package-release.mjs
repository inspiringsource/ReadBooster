/* global console, process */

import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import yazl from "yazl";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = join(root, "release");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const fixedMtime = new Date("2020-01-01T00:00:00.000Z");
const artifacts = {
  chrome: `readbooster-chrome-${version}.zip`,
  firefox: `readbooster-firefox-${version}.zip`,
  source: `readbooster-source-${version}.zip`,
};

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".DS_Store" || entry.name === "__MACOSX") {
      continue;
    }
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function writeZip(files, output) {
  await mkdir(dirname(output), { recursive: true });
  await rm(output, { force: true });
  const zip = new yazl.ZipFile();
  for (const { absolute, archivePath } of files.sort((left, right) =>
    left.archivePath.localeCompare(right.archivePath),
  )) {
    zip.addFile(absolute, archivePath, { mtime: fixedMtime, mode: 0o100644 });
  }
  zip.end();
  await new Promise((resolveZip, rejectZip) => {
    const outputStream = createWriteStream(output);
    outputStream.on("close", resolveZip);
    outputStream.on("error", rejectZip);
    zip.outputStream.on("error", rejectZip);
    zip.outputStream.pipe(outputStream);
  });
}

async function packageDirectory(directory, output) {
  const absoluteDirectory = join(root, directory);
  if (!existsSync(join(absoluteDirectory, "manifest.json"))) {
    throw new Error(`${directory}/manifest.json is missing; build it first`);
  }
  const files = (await filesUnder(absoluteDirectory)).map((absolute) => ({
    absolute,
    archivePath: relative(absoluteDirectory, absolute).split(sep).join("/"),
  }));
  await writeZip(files, output);
}

async function packageFirefox(output) {
  if (!existsSync(join(root, "dist-firefox/manifest.json"))) {
    throw new Error("dist-firefox/manifest.json is missing; build it first");
  }
  await mkdir(releaseDir, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/web-ext/bin/web-ext.js"),
      "build",
      "--source-dir",
      join(root, "dist-firefox"),
      "--artifacts-dir",
      releaseDir,
      "--filename",
      artifacts.firefox,
      "--overwrite-dest",
      "--no-input",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("web-ext failed to package the Firefox build");
  }
  if (!existsSync(output)) {
    throw new Error("web-ext did not create the expected Firefox ZIP");
  }
}

async function packageSource(output) {
  const directoryRoots = ["src", "public", "scripts", "tests", "docs", ".github"];
  const rootFiles = [
    ".editorconfig",
    ".gitignore",
    ".prettierignore",
    ".prettierrc.json",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "NOTICE.md",
    "README.md",
    "SECURITY.md",
    "THIRD_PARTY_NOTICES.md",
    "eslint.config.js",
    "package-lock.json",
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "vitest.config.ts",
  ];
  const files = [];
  for (const directory of directoryRoots) {
    for (const absolute of await filesUnder(join(root, directory))) {
      files.push({ absolute, archivePath: relative(root, absolute).split(sep).join("/") });
    }
  }
  for (const file of rootFiles) {
    const absolute = join(root, file);
    if (existsSync(absolute) && (await stat(absolute)).isFile()) {
      files.push({ absolute, archivePath: file });
    }
  }
  await writeZip(files, output);
}

async function writeChecksums() {
  const lines = [];
  for (const artifact of Object.values(artifacts)) {
    const path = join(releaseDir, artifact);
    const contents = await readFile(path);
    lines.push(`${createHash("sha256").update(contents).digest("hex")}  ${artifact}`);
  }
  await writeFile(join(releaseDir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
}

const command = process.argv[2];
if (command === "clean") {
  await rm(releaseDir, { recursive: true, force: true });
  await mkdir(releaseDir, { recursive: true });
} else if (command === "chrome") {
  await packageDirectory("dist-chrome", join(releaseDir, artifacts.chrome));
} else if (command === "firefox") {
  await packageFirefox(join(releaseDir, artifacts.firefox));
} else if (command === "source") {
  await packageSource(join(releaseDir, artifacts.source));
} else if (command === "checksums") {
  await writeChecksums();
} else {
  throw new Error(`Unknown package command: ${command ?? "missing"}`);
}

console.log(command === "checksums" ? "Release checksums written." : `${command} package ready.`);
