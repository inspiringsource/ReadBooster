# ReadBooster

ReadBooster turns long AI conversations and structured technical discussions into readable, navigable documents.

I started the project because useful AI conversations often become difficult to read, revisit, annotate, and print. ReadBooster adds a local reading layer across supported AI platforms without rewriting the original conversation.

ReadBooster was started by Avi and is maintained as an open-source AviCloud project. Ideas and contributions from the community are welcome. The project is licensed under the Mozilla Public License 2.0.

<p>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/readbooster/"><img src="docs/assets/store-badges/firefox-add-ons-badge.png" alt="Get ReadBooster for Firefox" height="54"></a>
  <a href="https://chromewebstore.google.com/detail/dgkgecgijplbfllnhcolplieaejjnmhd"><img src="docs/assets/store-badges/chrome-web-store-badge.png" alt="Available in the Chrome Web Store" height="54"></a>
</p>

_Firefox: version 0.7.3 available. Chrome: version 0.7.1 available; the 0.7.3 update is awaiting Chrome Web Store review._

Version 0.7.5 is the current unreleased candidate. It adds experimental reading support for individual repository and organisation GitHub Discussions while preserving the shared Reader, Guided Reading, Print Studio, Highlights, Stickers, and AI conversation adapters. Build scripts do not submit to stores or publish releases.

## Supported sources

### AI conversations

- ChatGPT at `chatgpt.com`
- Google Gemini at `gemini.google.com`
- Mistral at `chat.mistral.ai`
- Claude at `claude.ai`

### Structured discussions

- Repository Discussions at `github.com/<owner>/<repository>/discussions/<number>` — experimental in 0.7.5
- Organisation Discussions at `github.com/orgs/<organization>/discussions/<number>` — experimental in 0.7.5

ReadBooster can turn long GitHub Discussions into structured reading documents while preserving authorship, replies, code, tables, links, Highlights, Stickers, Guided Reading, and Print Studio. It activates only on individual discussion pages, reads content already rendered in the page, and does not use GitHub APIs or credentials.

Chrome and Firefox production builds are generated from the same TypeScript and React source. Claude has been tested successfully in a real authenticated conversation. GitHub Discussions has synthetic fixture and automated coverage; live logged-in and logged-out browser acceptance remains required before release.

## Features

Guided Reading emphasizes one meaningful passage at a time while keeping the surrounding document visible. It works in both Document and Focus views and supports scroll, keyboard, pointer, and compact passage controls.

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
- Guided Reading, with scroll, keyboard, and passage controls in both Document and Focus views
- Print Studio with section selection, prompts, annotations, layout presets, page breaks, and browser PDF output
- Conversation refresh, Copy, Print, and PDF output
- Local-first processing without a ReadBooster backend, analytics, or advertising

## Privacy and permissions

ReadBooster reads only the visible supported content DOM. It does not use provider or GitHub APIs, intercept credentials, upload source content, download executable code, or store complete source documents. Preferences, custom titles, Stickers, and highlights use extension-local storage. Persisted highlights include the selected passage and short surrounding context so ReadBooster can restore them reliably. Highlight data is not sent to a ReadBooster server. Feedback opens an external Tally form only after an explicit user action.

The only browser permission is `storage`. Host access and content scripts are restricted to the four AI origins plus `https://github.com/*`. GitHub’s match pattern covers the origin, while strict runtime routing activates ReadBooster only on individual repository or organisation Discussion pages. See `docs/privacy-policy-draft.md` and the browser-review documents under `docs/` for the audited disclosures.

## Installation

### Official stores

ReadBooster has listings in the Chrome Web Store and Firefox Add-ons. Store versions can update independently from the current source candidate, and Chrome and Firefox review on separate schedules. Do not treat local 0.7.5 artifacts as signed or store-approved releases.

- [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/dgkgecgijplbfllnhcolplieaejjnmhd)
- [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/readbooster/)

### Local Chrome testing

1. Run `npm ci` and `npm run build:chrome`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose Load unpacked and select `dist-chrome/`.
4. Reload the supported source page after loading or rebuilding the extension.

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
- `release/readbooster-chrome-0.7.5.zip` — complete Chrome upload archive
- `release/readbooster-firefox-0.7.5.zip` — unsigned Firefox submission archive
- `release/readbooster-source-0.7.5.zip` — reviewer source and build inputs

See `docs/release-builds.md` for the reproducible release workflow.

## Architecture

The source flow is:

    supported-source registry
          ↓
    source adapter
          ↓
    normalized, sanitized document model
          ↓
    shared Reader

Source selectors and DOM assumptions stay in `src/content/adapters/`. Shared rendering owns Document and Focus modes, outlines, Guided Reading, code, tables, document blocks, Stickers, highlights, reading settings, copying, and Print Studio. Print Studio creates a separate print representation from the normalized document; it does not edit source or Reader state. See `docs/adding-a-platform.md` for the adapter contract and test checklist.

## Feedback and contributions

Ideas, bug reports, documentation improvements, accessibility work, tests, and code contributions are all welcome.

You do not need to understand the whole project before getting involved. A small reproduction, a platform request, or a clear explanation of a reading problem can be useful. Search existing issues before opening a duplicate.

- [Report a bug or request a feature](https://github.com/inspiringsource/ReadBooster/issues/new/choose)
- [Browse existing issues](https://github.com/inspiringsource/ReadBooster/issues)
- [Read the contribution guide](CONTRIBUTING.md)
- [Learn how platform adapters work](docs/adding-a-platform.md)

Bug reports should include the browser and version, affected source, ReadBooster version, reproduction steps, expected behavior, actual behavior, and relevant console errors. Remove private conversation or discussion content, account information, tokens, and other sensitive material from screenshots and fixtures.

Do not report security vulnerabilities through a public issue. Follow the private reporting instructions in [SECURITY.md](SECURITY.md).

Before starting a larger feature or platform adapter, open an issue so we can compare ideas and avoid duplicated work. Contributions are reviewed carefully because browser extensions operate on potentially sensitive conversation content. The detailed testing, privacy, and adapter requirements remain in `CONTRIBUTING.md`.

The goal is not to support the largest number of sites or add features for their own sake. ReadBooster should make long, structured conversations and discussions easier to read, navigate, annotate, and reuse.

## AviCloud project notes

This repository uses [PWDNote](https://github.com/inspiringsource/pwdnote), another open-source AviCloud project, for encrypted maintainer notes. It includes the encrypted `.pwdnote.enc` workspace intentionally.

The file contains encrypted maintainer notes and project-continuity information for planning, development continuity, session recovery, and internal project organisation. It is included intentionally as part of the AviCloud development workflow.

It is not required for building, running, testing, or contributing to ReadBooster, and it is not included in extension or source-review release archives. Its contents and decryption process are private and are not documented here.

## Licence

ReadBooster is licensed under the Mozilla Public License 2.0. In general, distributed modifications to MPL-covered files remain available under MPL 2.0, while the licence permits those files to be combined with files under other licences. This summary is not legal advice; the complete terms are in `LICENSE`.

Third-party licences remain separate in `THIRD_PARTY_NOTICES.md`. Created and maintained by Avi as part of AviCloud, with help and ideas welcome from the community. Formal copyright information remains in `NOTICE.md`.

## Release status and limitations

Version 0.7.5 is marked Unreleased in `CHANGELOG.md`. Repository and organisation Discussion route gating, semantic extraction, source ordering, duplicate prevention, scope-isolated identity, and shared Reader compatibility have automated coverage, including the reported `/orgs/community/discussions/203678` route. Live extension testing in authenticated Chrome and Firefox remains a separate release acceptance step. ReadBooster includes only discussion content currently rendered on the page; it does not expand or retrieve hidden comments.

ReadBooster does not support GitHub Issues, pull requests, generic GitHub pages, Perplexity, DeepSeek, or private platform APIs. It does not provide accounts, analytics, cloud synchronization, remote processing, or automated store publishing.
