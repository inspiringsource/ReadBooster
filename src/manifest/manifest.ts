import { defineManifest } from "@crxjs/vite-plugin";

import packageJson from "../../package.json";
import { FAST_READING_FONT_PATH } from "../shared/assets";

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
export const FIREFOX_EXTENSION_ID = "contact@avicloud.ch";
export const FIREFOX_MINIMUM_VERSION = "142.0";

export type BuildTarget = "chrome" | "firefox";

export function normalizeBuildTarget(value: string | undefined): BuildTarget {
  return value === "firefox" ? "firefox" : "chrome";
}

export function createManifest(target: BuildTarget) {
  const browserSpecificSettings =
    target === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: FIREFOX_EXTENSION_ID,
              strict_min_version: FIREFOX_MINIMUM_VERSION,
              data_collection_permissions: {
                required: ["none"] as ["none"],
              },
            },
          },
        }
      : {};

  return {
    manifest_version: 3 as const,
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
        run_at: "document_idle" as const,
      },
    ],
    web_accessible_resources: [
      {
        resources: [FAST_READING_FONT_PATH],
        matches: [...SUPPORTED_HOST_MATCHES],
      },
    ],
    ...browserSpecificSettings,
  };
}

const target = normalizeBuildTarget(process.env.TARGET_BROWSER);

export default defineManifest(createManifest(target));
