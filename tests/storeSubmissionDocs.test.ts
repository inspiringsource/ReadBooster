import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const STORE_DOC = "docs/chrome-web-store-submission.md";
const PRIVACY_DRAFT = "docs/privacy-policy-draft.md";
const FIREFOX_SUBMISSION = "docs/firefox-submission.md";
const FIREFOX_LISTING = "docs/firefox-listing-draft.md";
const RELEASE_BUILDS = "docs/release-builds.md";

describe("Chrome Web Store release documentation", () => {
  it("provides submission and draft privacy documents without claiming publication", () => {
    expect(existsSync(STORE_DOC)).toBe(true);
    expect(existsSync(PRIVACY_DRAFT)).toBe(true);

    const submission = readFileSync(STORE_DOC, "utf8");
    const privacy = readFileSync(PRIVACY_DRAFT, "utf8");
    expect(submission).toContain("does not mean that the extension has been submitted");
    expect(privacy).toContain("This policy is not yet claimed to be published");
    expect(`${submission}\n${privacy}`).not.toMatch(
      /ReadBooster (?:is|has been) (?:published|available) (?:in|on) the Chrome Web Store/i,
    );
  });

  it("documents reproducible Firefox review builds without claiming publication", () => {
    for (const path of [FIREFOX_SUBMISSION, FIREFOX_LISTING, RELEASE_BUILDS, "LICENSE"]) {
      expect(existsSync(path)).toBe(true);
    }
    const combined = [FIREFOX_SUBMISSION, FIREFOX_LISTING, RELEASE_BUILDS]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(combined).toContain("contact@avicloud.ch");
    expect(combined).toContain("Firefox 142");
    expect(combined).toContain('required: ["none"]');
    expect(combined).toContain("npm ci");
    expect(combined).toContain("dist-firefox/manifest.json");
    expect(combined).not.toMatch(/ReadBooster (?:is|has been) published on AMO/i);
  });

  it("documents local storage, Tally, Limited Use, and the exact supported hosts", () => {
    const submission = readFileSync(STORE_DOC, "utf8");
    const privacy = readFileSync(PRIVACY_DRAFT, "utf8");
    const combined = `${submission}\n${privacy}`;

    expect(submission).toContain("https://chatgpt.com/*");
    expect(submission).toContain("https://gemini.google.com/*");
    expect(submission).toContain("https://chat.mistral.ai/*");
    expect(submission).toContain("No, ReadBooster does not use remote executable code.");
    expect(combined).toContain("section-title");
    expect(combined).toContain("Tally");
    expect(combined).toContain("Limited Use");
    expect(combined).toContain("does not persist complete conversations");
    expect(combined).not.toContain("https://claude.ai/*");
    expect(combined).not.toContain("Access to https://mistral.ai/*");
  });

  it("keeps website publication details as explicit user-supplied placeholders", () => {
    const privacy = readFileSync(PRIVACY_DRAFT, "utf8");
    const submission = readFileSync(STORE_DOC, "utf8");

    expect(privacy).toContain("[EFFECTIVE DATE TO BE PROVIDED]");
    expect(privacy).toContain("[USER-APPROVED SUPPORT CONTACT TO BE PROVIDED]");
    expect(privacy).toContain("suggestions only");
    expect(submission).toContain("website is maintained separately");
    expect(submission).toContain("add the Chrome Web Store link only after publication");
  });
});
