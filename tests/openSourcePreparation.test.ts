import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

describe("0.7.0 open-source preparation", () => {
  it("uses MPL-2.0 metadata and ships the official license plus project notice", () => {
    expect(packageJson.version).toBe("0.7.0");
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
      "docs/repository-maintenance.md",
      "docs/repository-audit-0.7.0.md",
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
    expect(readme).toContain("unreleased preparation build");
    expect(changelog).toContain("## [0.7.0] - Unreleased");
    expect(readme).not.toMatch(/0\.7\.0 (?:is|has been) published/i);
  });
});
