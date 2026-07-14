import { defineManifest } from "@crxjs/vite-plugin";

import packageJson from "../../package.json";

export default defineManifest({
  manifest_version: 3,
  name: "ReadBooster",
  description: "Read AI-generated responses in a calm, adjustable reader view.",
  version: packageJson.version,
  permissions: ["storage"],
  host_permissions: ["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"],
  action: {
    default_title: "ReadBooster",
    default_popup: "src/popup/index.html",
  },
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});
