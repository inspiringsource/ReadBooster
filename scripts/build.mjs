import { copyFile, rm } from "node:fs/promises";
import { URL } from "node:url";

import { build } from "vite";

await build();
await copyFile(
  new URL("../THIRD_PARTY_NOTICES.md", import.meta.url),
  new URL("../dist/THIRD_PARTY_NOTICES.md", import.meta.url),
);
await rm(new URL("../dist/.DS_Store", import.meta.url), { force: true });
await rm(new URL("../dist/__MACOSX", import.meta.url), { force: true, recursive: true });
await import("./verify-build.mjs");
