import { defineManifest } from "@crxjs/vite-plugin";

import packageJson from "../../package.json";

export const EXTENSION_ICONS = {
  "16": "icons/readbooster-16.png",
  "32": "icons/readbooster-32.png",
  "48": "icons/readbooster-48.png",
  "128": "icons/readbooster-128.png",
};

export const ACTION_ICONS = {
  "16": EXTENSION_ICONS["16"],
  "32": EXTENSION_ICONS["32"],
};

export default defineManifest({
  manifest_version: 3,
  name: "ReadBooster",
  description: "Read AI-generated responses in a calm, adjustable reader view.",
  version: packageJson.version,
  icons: EXTENSION_ICONS,
  permissions: ["storage"],
  host_permissions: ["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"],
  action: {
    default_title: "ReadBooster",
    default_popup: "src/popup/index.html",
    default_icon: ACTION_ICONS,
  },
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});
