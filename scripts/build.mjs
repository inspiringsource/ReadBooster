import { rm } from "node:fs/promises";
import { URL } from "node:url";

import { build } from "vite";

await build();
await rm(new URL("../dist/.DS_Store", import.meta.url), { force: true });
await rm(new URL("../dist/__MACOSX", import.meta.url), { force: true, recursive: true });
await import("./verify-build.mjs");
