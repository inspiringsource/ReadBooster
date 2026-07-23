# Firefox AMO submission notes

These notes prepare ReadBooster 0.6.8 for testing and AMO review. They do not claim submission, approval, signing, or publication.

## Add-on identity and compatibility

- Gecko ID: `contact@avicloud.ch`
- Minimum Firefox version: 142.0
- Manifest: Manifest V3
- Supported sites: `https://chatgpt.com/*`, `https://gemini.google.com/*`, and `https://chat.mistral.ai/*`
- Required extension permission: `storage`
- Data-collection declaration: `required: ["none"]`

Firefox 142 is selected as the unified minimum because Firefox desktop introduced the built-in manifest declaration for data collection and transmission in version 140, while Mozilla's validator requires version 142 for the same declaration on Firefox for Android. ReadBooster's prepared build is currently targeted and documented for desktop testing; Android has not been manually accepted. ReadBooster declares no collected or externally transmitted extension data. Conversation processing remains local; preferences, custom section titles, and private section Stickers remain in browser-managed local extension storage.

## Reviewer build steps

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build:firefox
npm run verify:firefox
npm run lint:firefox
```

The unpacked result is `dist-firefox/`. The AMO upload artifact is generated with:

```bash
npm run package:firefox
```

The original-source archive is generated with `npm run package:source`. Full instructions are in [release-builds.md](release-builds.md).

## Reviewer behavior notes

1. Load `dist-firefox/manifest.json` temporarily through `about:debugging`.
2. Open ChatGPT, Google Gemini, or a Mistral `/work/{conversation-id}` conversation with a reviewer-controlled account.
3. Open a conversation containing at least one assistant response.
4. Reload the platform page after installing the temporary add-on.
5. Select **Optimize Reading** or use the popup's **Optimize latest response** action.
6. Test Document and Focus modes, outline navigation, Reading settings, Copy, Print, tables, code blocks, custom section titles, local section Stickers, and conversation refresh.

ReadBooster has no account, backend, analytics, advertising, payment system, private AI-platform API use, or remote executable code. Conversation bodies are not persisted. The optional Tally feedback form is loaded only after explicit activation and receives only information the user deliberately enters.

The production bundles contain sanitized rendering paths that use `innerHTML` for already-sanitized normalized response HTML and locally generated syntax-highlighting markup. Mozilla's static validator can warn about these assignments; the shared sanitizer strips scripts, handlers, unsafe URLs, and unsupported markup before reader rendering.
