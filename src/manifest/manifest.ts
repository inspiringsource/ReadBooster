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

export const SUPPORTED_HOST_MATCHES = ["https://chatgpt.com/*", "https://gemini.google.com/*"];
export const MANIFEST_DESCRIPTION = "Turn AI conversations into readable, navigable documents.";
export const HOMEPAGE_URL = "https://inspiringsource.github.io/ReadBooster/";

export default defineManifest({
  manifest_version: 3,
  name: "ReadBooster",
  description: MANIFEST_DESCRIPTION,
  version: packageJson.version,
  homepage_url: HOMEPAGE_URL,
  icons: EXTENSION_ICONS,
  permissions: ["storage"],
  host_permissions: [...SUPPORTED_HOST_MATCHES],
  action: {
    default_title: "ReadBooster",
    default_popup: "src/popup/index.html",
    default_icon: ACTION_ICONS,
  },
  content_scripts: [
    {
      matches: [...SUPPORTED_HOST_MATCHES],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});
