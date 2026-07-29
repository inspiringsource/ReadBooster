# ReadBooster

ReadBooster turns long AI conversations into readable, navigable documents.

I started the project because useful AI conversations often become difficult to read, revisit, annotate, and print. ReadBooster adds a local reading layer across supported AI platforms without rewriting the original conversation.

ReadBooster was started by Avi and is maintained as an open-source AviCloud project. Ideas and contributions from the community are welcome. The project is licensed under the Mozilla Public License 2.0.

<p>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/readbooster/">
    <img src="docs/assets/store-badges/firefox-add-ons-badge.png" alt="Get ReadBooster for Firefox" height="54">
  </a>
  <a href="https://chromewebstore.google.com/detail/dgkgecgijplbfllnhcolplieaejjnmhd">
    <img src="docs/assets/store-badges/chrome-web-store-badge.png" alt="Available in the Chrome Web Store" height="54">
  </a>
</p>

_Firefox: version 0.7.2 available. Chrome: the latest update is awaiting Chrome Web Store review._

Version 0.7.2 is the current unreleased candidate. It adds persistent local text highlights and a lightweight highlights overview while preserving the responsive Optimize Reading control, Claude support, Stickers, and existing reading features. Build scripts do not submit to stores or publish releases.

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
- Persistent local text highlights with four accessible styles, navigation, and an overview
- Conversation refresh, Copy, Print, and PDF output
- Local-first processing without a ReadBooster backend, analytics, or advertising

## Privacy and permissions

ReadBooster reads only the visible conversation DOM on its supported sites. It does not use provider private APIs, intercept credentials, upload conversation content, download executable code, or store full conversation bodies. Preferences, custom titles, Stickers, and highlights use extension-local storage. Persisted highlights include the selected passage and short surrounding context so ReadBooster can restore them reliably. Highlight data is not sent to a ReadBooster server. Feedback opens an external Tally form only after an explicit user action.

The only browser permission is `storage`. Host access and content scripts are restricted to the four supported origins listed above. See `docs/privacy-policy-draft.md` and the browser-review documents under `docs/` for the audited disclosures.

## Installation

### Official stores

ReadBooster has listings in the Chrome Web Store and Firefox Add-ons. Store versions can update independently from the current source candidate, and Chrome and Firefox review on separate schedules. Do not treat local 0.7.2 artifacts as signed or store-approved releases.

- [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/dgkgecgijplbfllnhcolplieaejjnmhd)
- [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/readbooster/)

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
- `release/readbooster-chrome-0.7.2.zip` — complete Chrome upload archive
- `release/readbooster-firefox-0.7.2.zip` — unsigned Firefox submission archive
- `release/readbooster-source-0.7.2.zip` — reviewer source and build inputs

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

Provider selectors and DOM assumptions stay in `src/content/adapters/`. Shared rendering owns Document and Focus modes, outlines, code, tables, document blocks, Stickers, highlights, reading settings, copying, and printing. See `docs/adding-a-platform.md` for the adapter contract and test checklist.

## Feedback and contributions

Ideas, bug reports, documentation improvements, accessibility work, tests, and code contributions are all welcome.

You do not need to understand the whole project before getting involved. A small reproduction, a platform request, or a clear explanation of a reading problem can be useful. Search existing issues before opening a duplicate.

- [Report a bug or request a feature](https://github.com/inspiringsource/ReadBooster/issues/new/choose)
- [Browse existing issues](https://github.com/inspiringsource/ReadBooster/issues)
- [Read the contribution guide](CONTRIBUTING.md)
- [Learn how platform adapters work](docs/adding-a-platform.md)

Bug reports should include the browser and version, affected AI platform, ReadBooster version, reproduction steps, expected behavior, actual behavior, and relevant console errors. Remove private conversation content, account information, tokens, and other sensitive material from screenshots and fixtures.

Do not report security vulnerabilities through a public issue. Follow the private reporting instructions in [SECURITY.md](SECURITY.md).

Before starting a larger feature or platform adapter, open an issue so we can compare ideas and avoid duplicated work. Contributions are reviewed carefully because browser extensions operate on potentially sensitive conversation content. The detailed testing, privacy, and adapter requirements remain in `CONTRIBUTING.md`.

The goal is not to support the largest number of AI platforms or add features for their own sake. ReadBooster should make real conversations easier to read, navigate, annotate, and reuse.

## AviCloud project notes

This repository uses [PWDNote](https://github.com/inspiringsource/pwdnote), another open-source AviCloud project, for encrypted maintainer notes. It includes the encrypted `.pwdnote.enc` workspace intentionally.

The file contains encrypted maintainer notes and project-continuity information for planning, development continuity, session recovery, and internal project organisation. It is included intentionally as part of the AviCloud development workflow.

It is not required for building, running, testing, or contributing to ReadBooster, and it is not included in extension or source-review release archives. Its contents and decryption process are private and are not documented here.

## Licence

ReadBooster is licensed under the Mozilla Public License 2.0. In general, distributed modifications to MPL-covered files remain available under MPL 2.0, while the licence permits those files to be combined with files under other licences. This summary is not legal advice; the complete terms are in `LICENSE`.

Third-party licences remain separate in `THIRD_PARTY_NOTICES.md`. Created and maintained by Avi as part of AviCloud, with help and ideas welcome from the community. Formal copyright information remains in `NOTICE.md`.

## Release status and limitations

Version 0.7.2 is marked Unreleased in `CHANGELOG.md`. Highlight creation, persistence, anchoring, rendering, navigation, and removal have automated coverage, but the complete authenticated browser matrix remains a separate release acceptance step. Highlighting is intentionally limited to a single semantic text block at a time; code, mathematics, generated charts, and other complex interactive content are excluded when reliable restoration would be unsafe.

ReadBooster does not support Perplexity, DeepSeek, or Claude private APIs. It does not provide accounts, analytics, cloud synchronization, remote processing, or automated store publishing.
