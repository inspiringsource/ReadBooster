import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isSupportedPlatformUrl,
  SUPPORTED_PLATFORM_HOST_MATCHES,
  SUPPORTED_PLATFORMS,
  supportedPlatformForHostname,
} from "../src/shared/platforms";

describe("supported platform registry", () => {
  it("is the exact supported-source permission boundary", () => {
    expect(SUPPORTED_PLATFORMS.map(({ id }) => id)).toEqual([
      "chatgpt",
      "gemini",
      "mistral",
      "claude",
      "github-discussion",
    ]);
    expect(SUPPORTED_PLATFORM_HOST_MATCHES).toEqual([
      "https://chatgpt.com/*",
      "https://gemini.google.com/*",
      "https://chat.mistral.ai/*",
      "https://claude.ai/*",
      "https://github.com/*",
    ]);
  });

  it("rejects lookalike, marketing, and Claude subdomain hosts", () => {
    expect(supportedPlatformForHostname("claude.ai")?.id).toBe("claude");
    expect(supportedPlatformForHostname("chat.claude.ai")).toBeNull();
    expect(supportedPlatformForHostname("claude.ai.example.org")).toBeNull();
    expect(supportedPlatformForHostname("mistral.ai")).toBeNull();
    expect(isSupportedPlatformUrl("https://claude.ai/chat/example")).toBe(true);
    expect(isSupportedPlatformUrl("https://chat.claude.ai/chat/example")).toBe(false);
    expect(isSupportedPlatformUrl("https://github.com/example/reader/discussions/42")).toBe(true);
    expect(isSupportedPlatformUrl("https://github.com/orgs/community/discussions/203678")).toBe(
      true,
    );
    expect(isSupportedPlatformUrl("https://github.com/example/reader/issues/42")).toBe(false);
    expect(isSupportedPlatformUrl("https://github.com/orgs/community/discussions")).toBe(false);
  });

  it("routes every supported adapter through one shared responsive injected control", () => {
    const contentEntry = readFileSync("src/content/index.ts", "utf8");
    expect(contentEntry.match(/injectOptimizeButton\(/g)).toHaveLength(1);
    expect(contentEntry).toContain("requestOptimizeButtonLayout(document)");
    expect(contentEntry).not.toMatch(/adapter\.source\s*===/);
  });
});
