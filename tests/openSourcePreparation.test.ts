import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("open-source preparation", () => {
  it("uses MPL-2.0 metadata and ships the official license plus project notice", () => {
    expect(packageJson.version).toBe("0.7.2");
    expect(packageJson.license).toBe("MPL-2.0");
    expect(readFileSync("LICENSE", "utf8")).toContain("Mozilla Public License Version 2.0");
    expect(readFileSync("NOTICE.md", "utf8")).toContain("Copyright 2026 Abraham Bobrovsky");
  });

  it("includes contributor, security, adapter, audit, and community preparation files", () => {
    for (const path of [
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "SECURITY.md",
      "docs/adding-a-platform.md",
      "docs/highlight-manual-test.md",
      "docs/repository-maintenance.md",
      "docs/repository-audit-0.7.0.md",
      "docs/repository-audit-0.7.1.md",
      "docs/public-release-checklist.md",
      ".github/CODEOWNERS",
      ".github/dependabot.yml",
      ".github/workflows/ci.yml",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/ISSUE_TEMPLATE/feature_request.yml",
      ".github/ISSUE_TEMPLATE/platform_support.yml",
      ".github/pull_request_template.md",
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
  });

  it("keeps public-release status explicitly pending", () => {
    const readme = readFileSync("README.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    expect(readme).toContain("current unreleased candidate");
    expect(changelog).toContain("## [0.7.2] - Unreleased");
    expect(readme).not.toMatch(/0\.7\.2 (?:is|has been) published/i);
  });

  it("documents the intentional encrypted PWDNote file without making it a build input", () => {
    const readme = readFileSync("README.md", "utf8");
    const packageSource = readFileSync("scripts/package-release.mjs", "utf8");
    const archiveVerifier = readFileSync("scripts/verify-release-archives.mjs", "utf8");
    expect(existsSync(".pwdnote.enc")).toBe(true);
    expect(readme).toContain("## AviCloud project notes");
    expect(readme).toContain("encrypted `.pwdnote.enc`");
    expect(readme).toContain("not required for building, running, testing, or contributing");
    expect(packageSource).not.toContain('".pwdnote.enc"');
    expect(archiveVerifier).toContain(".pwdnote\\.enc");
  });

  it("keeps public automation read-only and contribution-focused", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const dependabot = readFileSync(".github/dependabot.yml", "utf8");
    expect(readFileSync(".github/CODEOWNERS", "utf8").trim()).toBe("* @inspiringsource");
    expect(ci).toContain("contents: read");
    expect(ci).not.toMatch(/contents:\s*write|packages:\s*write|pull-requests:\s*write/);
    for (const command of [
      "npm ci",
      "npm run typecheck",
      "npm run lint",
      "npm run test",
      "npm run build:chrome",
      "npm run build:firefox",
      "npm run verify:chrome",
      "npm run verify:firefox",
    ]) {
      expect(ci).toContain(`run: ${command}`);
    }
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("interval: weekly");
    expect(dependabot).toContain("npm-dependencies:");
  });
});
