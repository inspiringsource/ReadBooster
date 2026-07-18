/* global process */

import { copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";

import { build } from "vite";

const requestedTarget = process.argv[2];
const target = requestedTarget === "firefox" ? "firefox" : "chrome";
const outDir = requestedTarget ? `dist-${target}` : "dist";
process.env.TARGET_BROWSER = target;
process.env.READBOOSTER_OUT_DIR = outDir;

await build({
  build: {
    outDir,
  },
});
await copyFile(
  new URL("../THIRD_PARTY_NOTICES.md", import.meta.url),
  new URL(`../${outDir}/THIRD_PARTY_NOTICES.md`, import.meta.url),
);
await rm(new URL(`../${outDir}/.DS_Store`, import.meta.url), { force: true });
await rm(new URL(`../${outDir}/__MACOSX`, import.meta.url), {
  force: true,
  recursive: true,
});

const { verifyBuild } = await import("./verify-build.mjs");
verifyBuild({ target, dist: resolve(outDir) });
