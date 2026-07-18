import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./src/manifest/manifest";

const target = process.env.TARGET_BROWSER === "firefox" ? "firefox" : "chrome";
const defaultOutDir = process.env.TARGET_BROWSER ? `dist-${target}` : "dist";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: process.env.READBOOSTER_OUT_DIR ?? defaultOutDir,
    emptyOutDir: true,
  },
});
