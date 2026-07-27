import type { ExtractedResponseSource } from "./types";

export interface SupportedPlatformDefinition {
  readonly id: ExtractedResponseSource;
  readonly displayName: string;
  readonly hostname: string;
  readonly manifestMatch: string;
}

export const SUPPORTED_PLATFORMS: readonly SupportedPlatformDefinition[] = [
  {
    id: "chatgpt",
    displayName: "ChatGPT",
    hostname: "chatgpt.com",
    manifestMatch: "https://chatgpt.com/*",
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    hostname: "gemini.google.com",
    manifestMatch: "https://gemini.google.com/*",
  },
  {
    id: "mistral",
    displayName: "Mistral",
    hostname: "chat.mistral.ai",
    manifestMatch: "https://chat.mistral.ai/*",
  },
  {
    id: "claude",
    displayName: "Claude",
    hostname: "claude.ai",
    manifestMatch: "https://claude.ai/*",
  },
] as const;

export const SUPPORTED_PLATFORM_HOST_MATCHES = SUPPORTED_PLATFORMS.map(
  ({ manifestMatch }) => manifestMatch,
);

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function supportedPlatformForHostname(hostname: string): SupportedPlatformDefinition | null {
  const normalized = normalizeHostname(hostname);
  return (
    SUPPORTED_PLATFORMS.find(({ id, hostname: supportedHostname }) =>
      id === "chatgpt"
        ? normalized === supportedHostname || normalized.endsWith(`.${supportedHostname}`)
        : normalized === supportedHostname,
    ) ?? null
  );
}

export function isSupportedPlatformUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    return supportedPlatformForHostname(new URL(value).hostname) !== null;
  } catch {
    return false;
  }
}
