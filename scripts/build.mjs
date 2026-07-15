import { build } from "vite";

await build();
await import("./verify-build.mjs");
