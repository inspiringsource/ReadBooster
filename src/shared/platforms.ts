import type { ExtractedResponseSource } from "./types";
import { parseGitHubDiscussionUrl } from "./githubDiscussions";

export interface SupportedPlatformDefinition {
  readonly id: ExtractedResponseSource;
  readonly displayName: string;
  readonly hostname: string;
  readonly manifestMatch: string;
  readonly sourceKind: "ai-conversation" | "structured-discussion";
}

export const SUPPORTED_PLATFORMS: readonly SupportedPlatformDefinition[] = [
  {
    id: "chatgpt",
    displayName: "ChatGPT",
    hostname: "chatgpt.com",
    manifestMatch: "https://chatgpt.com/*",
    sourceKind: "ai-conversation",
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    hostname: "gemini.google.com",
    manifestMatch: "https://gemini.google.com/*",
    sourceKind: "ai-conversation",
  },
  {
    id: "mistral",
    displayName: "Mistral",
    hostname: "chat.mistral.ai",
    manifestMatch: "https://chat.mistral.ai/*",
    sourceKind: "ai-conversation",
  },
  {
    id: "claude",
    displayName: "Claude",
    hostname: "claude.ai",
    manifestMatch: "https://claude.ai/*",
    sourceKind: "ai-conversation",
  },
  {
    id: "github-discussion",
    displayName: "GitHub Discussions",
    hostname: "github.com",
    manifestMatch: "https://github.com/*",
    sourceKind: "structured-discussion",
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
    const url = new URL(value);
    const platform = supportedPlatformForHostname(url.hostname);
    return platform?.id === "github-discussion"
      ? parseGitHubDiscussionUrl(url) !== null
      : platform !== null;
  } catch {
    return false;
  }
}
