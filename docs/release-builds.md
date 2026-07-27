# ReadBooster browser release builds

ReadBooster 0.7.1 uses one TypeScript/React source tree and one generated manifest model. The build target adds only the browser-specific manifest fields and writes to an isolated output directory.

## Requirements

- Node.js 22 or newer. The release was prepared with Node.js 22.
- Use the npm version bundled with the selected Node.js release.
- macOS, Linux, or Windows.
- No globally installed build tools are required. Mozilla `web-ext`, ZIP creation, and ZIP inspection are lockfile-controlled development dependencies.

## Clean reproducible build

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build:chrome
npm run build:firefox
npm run verify:chrome
npm run verify:firefox
npm run lint:firefox
```

Outputs:

```text
dist-chrome/
dist-firefox/
```

The legacy `npm run build` command remains a Chrome-compatible unpacked build in `dist/`.

## Release archives

Run the complete build, lint, package, archive verification, and checksum workflow:

```bash
npm run release
```

It creates:

```text
release/readbooster-chrome-0.7.1.zip
release/readbooster-firefox-0.7.1.zip
release/readbooster-source-0.7.1.zip
release/SHA256SUMS.txt
```

The extension ZIPs contain `manifest.json` at their root. The source ZIP includes the source, public assets, scripts, tests, configuration, documentation, license notice, dependency lockfile, and third-party notices required to reproduce both builds. It excludes dependencies, generated outputs, repository history, local encrypted files, environment files, prior archives, and operating-system metadata.

## Browser manifest differences

Both targets use Manifest V3, the `storage` permission, the same ChatGPT, Gemini, `chat.mistral.ai`, and Claude host patterns, popup, content script, icons, and narrowly scoped web-accessible resources. The Firefox build alone adds:

```json
"browser_specific_settings": {
  "gecko": {
    "id": "contact@avicloud.ch",
    "strict_min_version": "142.0",
    "data_collection_permissions": {
      "required": ["none"]
    }
  }
}
```

Firefox 142 is the unified minimum because desktop support for `data_collection_permissions` began in Firefox 140 while Firefox for Android support began in 142. Using 142 avoids claiming manifest compatibility that Mozilla's validator cannot confirm across Firefox variants. ReadBooster's prepared build is currently targeted and documented for desktop testing; Android has not been manually accepted. No `update_url` is added because AMO will manage signed updates.

## Reviewability and runtime code

- Source is TypeScript and React; Vite and CRXJS generate the production JavaScript.
- Production bundles use Vite's ordinary minification and content-derived filenames. They are not obfuscated. The filenames are stable for identical generated content; `web-ext build` may record the packaging time in Firefox ZIP metadata, so the submitted ZIP's byte checksum is specific to that packaging run even when its unpacked contents reproduce exactly.
- Source maps are not included in store packages, matching the existing production build. The complete source archive and locked build instructions reproduce the bundles.
- No executable code is downloaded or evaluated at runtime.
- Highlight.js and application code are bundled locally.
- Fast Sans and extension icons are bundled locally. Fast Font is attributed under the MIT License in `THIRD_PARTY_NOTICES.md`.
- Project-owned source is licensed under MPL-2.0 through `LICENSE` and `NOTICE.md`.
- The user-initiated Tally iframe is external page content, not extension code. ReadBooster does not load Tally's widget script or inspect submitted form content.

## Temporary Firefox testing

1. Run `npm run build:firefox`.
2. Open `about:debugging` in Firefox.
3. Select **This Firefox**.
4. Select **Load Temporary Add-on**.
5. Choose `dist-firefox/manifest.json`.

Temporary loading is for local testing only. Normal Firefox installation requires an AMO-signed package. `npm run package:firefox` creates an unsigned ZIP for AMO submission; it does not sign or publish it.
