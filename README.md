# ReadBooster

> ReadBooster is an open-source document layer for AI conversations.

ReadBooster turns long AI chats into structured, navigable reading documents. It creates a separate Reader rather than rewriting, summarizing, or editing the source conversation. Conversation extraction and rendering happen locally in the browser.

ReadBooster is maintained by AviCloud and licensed under the Mozilla Public License 2.0.

Version 0.7.1 is the current unreleased candidate. It adds responsive full and icon-only forms of the shared Optimize Reading control while retaining the Claude support and open-source documentation introduced in 0.7.0. Build scripts do not submit to stores or publish releases.

## Supported platforms

- ChatGPT at `chatgpt.com`
- Google Gemini at `gemini.google.com`
- Mistral at `chat.mistral.ai`
- Claude at `claude.ai`

Chrome and Firefox production builds are generated from the same TypeScript and React source. Claude support is covered by sanitized fixtures and automated tests, and it has been tested successfully in a real authenticated Claude conversation after the latest fix. Browser-specific release regression remains part of the normal acceptance process.

## Features

- Continuous Document view for complete conversations
- Focus view for individual assistant responses
- Conversation outline and heading navigation
- Custom section titles and collapsible prompts
- Default, Serif, Dyslexia-friendly, and Fast Reading styles
- Adjustable appearance, text size, spacing, and opening position
- Fit, Wide, Compact, and Fullscreen table modes
- Syntax-aware code presentation and copying
- Static document blocks for provider-generated documents and artifacts
- Local Stickers attached to conversation sections
- Conversation refresh, Copy, Print, and PDF output
- Local-first processing without a ReadBooster backend, analytics, or advertising

## Privacy and permissions

ReadBooster reads only the visible conversation DOM on its supported sites. It does not use provider private APIs, intercept credentials, upload conversation content, download executable code, or store full conversation bodies. Preferences, custom titles, and Stickers use extension-local storage. Feedback opens an external Tally form only after an explicit user action.

The only browser permission is `storage`. Host access and content scripts are restricted to the four supported origins listed above. See `docs/privacy-policy-draft.md` and the browser-review documents under `docs/` for the audited disclosures.

## Installation

### Official stores

ReadBooster has listings in the Chrome Web Store and Firefox Add-ons. Store versions can update independently from the current source version; the Chrome Web Store update for 0.7.1 is still pending review. Do not treat local 0.7.1 artifacts as signed or store-approved releases.

### Local Chrome testing

1. Run `npm ci` and `npm run build:chrome`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose Load unpacked and select `dist-chrome/`.
4. Reload the supported AI platform tab after loading or rebuilding the extension.

### Temporary Firefox testing

1. Run `npm ci` and `npm run build:firefox`.
2. Open `about:debugging` and select This Firefox.
3. Choose Load Temporary Add-on and select `dist-firefox/manifest.json`.

Temporary installation is not a signed public Firefox installation.

## Development

Requirements:

- Node.js 22 or newer
- npm from the Node.js distribution
- no global build dependencies

Common commands:

| Purpose                           | Command                  |
| --------------------------------- | ------------------------ |
| Install exactly from the lockfile | `npm ci`                 |
| Local Vite development server     | `npm run dev`            |
| Type checking                     | `npm run typecheck`      |
| ESLint                            | `npm run lint`           |
| Unit and integration tests        | `npm run test`           |
| Browser rendering harness         | `npm run test:browser`   |
| Chrome production build           | `npm run build:chrome`   |
| Firefox production build          | `npm run build:firefox`  |
| Verify Chrome output              | `npm run verify:chrome`  |
| Verify Firefox output             | `npm run verify:firefox` |
| Mozilla manifest lint             | `npm run lint:firefox`   |
| Build all release archives        | `npm run release`        |

Build outputs are isolated:

- `dist-chrome/` — unpacked Chrome extension
- `dist-firefox/` — unpacked Firefox extension
- `release/readbooster-chrome-0.7.1.zip` — complete Chrome upload archive
- `release/readbooster-firefox-0.7.1.zip` — unsigned Firefox submission archive
- `release/readbooster-source-0.7.1.zip` — reviewer source and build inputs

See `docs/release-builds.md` for the reproducible release workflow.

## Architecture

The source flow is:

    platform registry
          ↓
    platform adapter
          ↓
    normalized, sanitized conversation model
          ↓
    shared Reader

Provider selectors and DOM assumptions stay in `src/content/adapters/`. Shared rendering owns Document and Focus modes, outlines, code, tables, document blocks, Stickers, reading settings, copying, and printing. See `docs/adding-a-platform.md` for the adapter contract and test checklist.

## Contributing

Bug reports, focused feature requests, documentation improvements, accessibility improvements, and platform-adapter contributions are welcome. New platform adapters must keep provider-specific extraction separate from the shared Reader and include representative sanitized fixtures and regression coverage.

Read `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` before preparing changes. Discuss broad features, new permissions, storage migrations, dependencies, or platform support before implementation. Provider changes require sanitized fixtures, extraction regressions, duplicate and streaming coverage, and honest manual-browser verification.

## AviCloud project notes

This repository includes an encrypted `.pwdnote.enc` file created with [PWDNote](https://github.com/inspiringsource/pwdnote), another AviCloud open-source project.

The file contains encrypted maintainer notes and project-continuity information for planning, development continuity, session recovery, and internal project organisation. It is included intentionally as part of the AviCloud development workflow.

It is not required for building, running, testing, or contributing to ReadBooster, and it is not included in extension or source-review release archives. Its contents and decryption process are private and are not documented here.

## Licence

ReadBooster is licensed under the Mozilla Public License 2.0. In general, distributed modifications to MPL-covered files remain available under MPL 2.0, while the licence permits those files to be combined with files under other licences. This summary is not legal advice; the complete terms are in `LICENSE`.

Third-party licences remain separate in `THIRD_PARTY_NOTICES.md`. ReadBooster is maintained by AviCloud. Copyright 2026 Abraham Bobrovsky.

## Release status and limitations

Version 0.7.1 is marked Unreleased in `CHANGELOG.md`. Its responsive injected control is covered by measured-layout tests, but real composer and side-panel layouts still require signed-in acceptance across supported platforms. Claude route, extraction, streaming, artifact, and shared-reader behavior have automated fixture coverage, and a real authenticated Claude conversation was tested successfully after the latest fix. A complete browser-specific regression matrix has not been claimed.

ReadBooster does not support Perplexity, DeepSeek, or Claude private APIs. It does not provide accounts, analytics, cloud synchronization, remote processing, or automated store publishing.
