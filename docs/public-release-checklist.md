# Public open-source release checklist

This checklist prepares ReadBooster for publication. Completing the local preparation items does not
make the repository public or publish an extension.

## Repository and governance

- [ ] Apply the reviewed public repository metadata:
  - Name: `ReadBooster`
  - Description: `Open-source browser extension that turns AI conversations into readable, navigable documents.`
  - Homepage: `https://inspiringsource.github.io/ReadBooster/`
  - Default branch: `main`
  - Topics: `browser-extension`, `accessibility`, `reading`, `chatgpt`, `gemini`, `mistral`,
    `claude`, `typescript`, `react`, `chrome-extension`, `firefox-addon`
- [ ] Perform a final README, licence, notice, contributor, Code of Conduct, and security-policy review.
- [x] Keep the maintainer-reviewed `.pwdnote.enc` ciphertext tracked intentionally as part of the
      AviCloud/PWDNote workflow; it is not a ReadBooster build input and must not be decrypted or
      exposed during publication preparation.
- [ ] Change repository visibility only after every security and privacy item below is complete.
- [ ] Enable branch protection for `main` and require pull requests and the CI check.
- [ ] Verify that CODEOWNERS requests review from `@inspiringsource`.
- [ ] Enable Dependabot alerts, security updates, and the weekly grouped npm update configuration.
- [ ] Verify the bug, feature, platform-support, and pull-request templates in the public interface.
- [ ] Test the external-contributor workflow using a fork without granting unnecessary repository
      permissions.

## Security and privacy

- [ ] Run a dedicated secret scanner against the current tree and complete Git history.
- [ ] Review commit-author metadata, historical archives, binary assets, and fixtures for personal or
      private information.
- [ ] Rotate any credential found in history before publication; deleting the current file is not
      sufficient.
- [ ] Review dependency licences and `npm audit` findings, including development-only build tooling.
- [ ] Confirm `contact@avicloud.ch` is monitored for security and conduct reports.
- [ ] Confirm browser permissions and hosts remain limited to documented supported platforms.
- [ ] Confirm no remote executable code, analytics, credential handling, or conversation upload was
      introduced.

## Build and contribution readiness

- [ ] Run `npm ci`, formatting, type checking, linting, and the complete test suite from a clean
      checkout.
- [ ] Build and verify the Chrome and Firefox extensions.
- [ ] Run the Chromium rendering harness and `web-ext lint`.
- [ ] Confirm GitHub Actions passes on both a branch push and a pull request.
- [ ] Confirm contributor and platform-adapter documentation matches the current architecture.
- [ ] Verify local Markdown links and review external documentation links.
- [ ] Inspect Chrome, Firefox, and source archives for wrapper directories, private files, and stale
      versions.

## Product and browser acceptance

- [ ] Complete authenticated Chrome and Firefox testing on ChatGPT, Google Gemini, Mistral, and
      Claude.
- [ ] Complete responsive, zoom, keyboard, accessibility, copy, print, and privacy checks.
- [ ] Record known platform DOM limitations without presenting fixture-only checks as live acceptance.
- [ ] Finalize changelog and release notes without marking an unreleased candidate as published.

## Public launch coordination

- [ ] Update the ReadBooster website and privacy page after repository and release URLs are final.
- [ ] Update Chrome Web Store listing text, privacy declarations, screenshots, and reviewer notes.
- [ ] Submit the complete Chrome extension archive through the existing store identity.
- [ ] Update Firefox Add-ons listing text, data-collection declaration, source archive, and reviewer
      instructions.
- [ ] Submit the unsigned Firefox archive to AMO and distribute only Mozilla-signed output.
- [ ] Create and protect the version tag through the documented maintainer release process.
- [ ] Create the GitHub release with checksums and links to the exact reviewed artifacts.
- [ ] Confirm store, website, repository, changelog, and package version status are consistent.

## After publication

- [ ] Verify public clone, `npm ci`, both builds, and CI from a clean external environment.
- [ ] Verify issue forms, security contact, CODEOWNERS, Dependabot, and branch rules work as intended.
- [ ] Monitor the first public issues and dependency updates without granting release access to
      contributors.
