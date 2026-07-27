# ReadBooster

> ReadBooster is an open-source document layer for AI conversations.

ReadBooster turns long AI chats into structured, navigable reading documents. It creates a separate Reader rather than rewriting, summarizing, or editing the source conversation. Conversation extraction and rendering happen locally in the browser.

Version 0.7.1 is an unreleased preparation build. It adds responsive full and icon-only forms of the shared Optimize Reading control while retaining the Claude and open-source preparation introduced in 0.7.0. No store submission or public release is performed by the build scripts.

## Supported platforms

- ChatGPT at `chatgpt.com`
- Google Gemini at `gemini.google.com`
- Mistral at `chat.mistral.ai`
- Claude at `claude.ai`

Chrome and Firefox production builds are generated from the same TypeScript and React source. Claude support is covered by sanitized fixtures and automated tests; authenticated live Claude verification must be completed before the release is presented as fully accepted.

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

Use the official ReadBooster listing in the Chrome Web Store or Firefox Add-ons when a published version is available. Version 0.7.1 has not been submitted or published by this repository task, so do not treat local 0.7.1 artifacts as signed public releases.

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

ReadBooster is being prepared for public open-source development. Contribution guidelines and community templates are included so the repository is ready when public collaboration begins.

Read `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` before preparing changes. Discuss broad features, new permissions, storage migrations, dependencies, or platform support before implementation. Provider changes require sanitized fixtures, extraction regressions, duplicate and streaming coverage, and honest manual-browser verification.

## Licence

ReadBooster is licensed under the Mozilla Public License 2.0. In general, distributed modifications to MPL-covered files remain available under MPL 2.0, while the licence permits those files to be combined with files under other licences. This summary is not legal advice; the complete terms are in `LICENSE`.

Third-party licences remain separate in `THIRD_PARTY_NOTICES.md`. ReadBooster is maintained by AviCloud. Copyright 2026 Abraham Bobrovsky.

## Release status and limitations

Version 0.7.1 is marked Unreleased in `CHANGELOG.md`. Its responsive injected control is covered by measured-layout tests, but real composer and side-panel layouts still require signed-in acceptance across supported platforms. Claude route, extraction, streaming, artifact, and shared-reader behavior remain fixture-backed pending live verification in both browsers.

ReadBooster does not support Perplexity, DeepSeek, or Claude private APIs. It does not provide accounts, analytics, cloud synchronization, remote processing, or automated store publishing.
