# ReadBooster

ReadBooster is a local-first Chrome extension that opens the latest AI assistant response in a focused, full-screen reader overlay. The reader improves typography and spacing without rewriting, summarizing, reordering, or otherwise semantically editing the response.

> **Privacy:** ReadBooster processes content locally in your browser.

This repository contains the first MVP. ChatGPT extraction is implemented and covered by mock-DOM tests. Live Chrome verification is still required because ChatGPT's DOM is not a public or stable API.

## MVP scope

- Detect configured AI conversation sites.
- Inject one idempotent **Optimize Reading** control.
- Extract the latest ChatGPT assistant response.
- Remove host controls and sanitize the cloned HTML with a conservative allowlist.
- Open a Shadow DOM-isolated full-screen reader overlay.
- Preserve paragraphs, headings, lists, links, blockquotes, code, tables, emphasis, and preformatted text.
- Offer light, dark, and system appearance; text-size and spacing controls; Comfortable and Dyslexia-friendly visual presets; copy; print; visible focus; and Escape-key closing.
- Store only validated reader preferences in `chrome.storage.local`.
- Provide a small popup that reports page support and calls the same content-script operation as the injected button.

ReadBooster has no backend, account system, analytics, remote assets, AI API, or conversation-content persistence. It does not send extracted content over the network.

## Technology stack

- TypeScript and React for typed extension and reader UI code
- Vite for development and production bundling
- Chrome Manifest V3
- `@crxjs/vite-plugin` for a lightweight Vite-to-MV3 build pipeline
- DOMPurify for maintained browser-side HTML sanitization
- Vitest, jsdom, and Testing Library for focused DOM unit tests
- ESLint and Prettier for code quality and formatting conventions

No background service worker is present because the popup can communicate directly with the content script and preferences can be stored directly from extension contexts.

## Website and adapter status

| Website                      | Host access | Adapter implementation                                | Automated verification                    | Manual Chrome verification                  |
| ---------------------------- | ----------- | ----------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| ChatGPT (`chatgpt.com`)      | Configured  | Functional latest-assistant extraction implementation | Mock DOM fixture tests                    | **Not yet verified** against the live site  |
| Claude (`claude.ai`)         | Configured  | Scaffold; safely returns `null` / `[]`                | Safe no-result behavior by implementation | Not verified; no extraction support claimed |
| Gemini (`gemini.google.com`) | Configured  | Scaffold; safely returns `null` / `[]`                | Safe no-result behavior by implementation | Not verified; no extraction support claimed |

“Functional” for ChatGPT describes the implemented adapter and automated fixture behavior, not a claim that the current live ChatGPT DOM has been manually verified. Selectors and assumptions that may require maintenance are commented in `ChatGPTAdapter.ts`.

## Install dependencies

Requirements: a current Node.js LTS release, npm, and Google Chrome.

```bash
npm install
```

## Development commands

```bash
npm run dev       # Vite extension development build/watch workflow
npm run typecheck # TypeScript validation without output
npm run lint      # ESLint checks
npm run test      # Unit tests in jsdom
npm run build     # Clean production build in dist/
```

The development command runs Vite's extension-aware development workflow. Chrome still needs an unpacked extension directory loaded; follow terminal guidance from the Vite/CRXJS process and reload the extension when Chrome does not pick up a change automatically.

## Build and load in Chrome

1. Run the production build: `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the generated extension build directory: `dist/`.
6. Open ChatGPT at `https://chatgpt.com/`.
7. Refresh the page if necessary.
8. Open a conversation containing an assistant response.
9. Click **Optimize Reading**.

After rebuilding, use the reload control on the ReadBooster card in `chrome://extensions`, then refresh the ChatGPT tab.

## Manual acceptance test

Automated tests deliberately use compact fixtures rather than reproducing a brittle copy of the live ChatGPT DOM. Complete these checks in Chrome before describing the ChatGPT integration as manually verified:

1. Build and load `dist/` using the instructions above.
2. Open a ChatGPT conversation with multiple assistant responses.
3. Confirm exactly one **Optimize Reading** button appears and is reachable by keyboard.
4. Click the injected button and confirm the latest—not the first—assistant response opens.
5. Confirm paragraphs, headings, lists, links, blockquotes, inline code, code blocks, and tables remain semantically intact when present.
6. Confirm ChatGPT feedback, copy, audio, and action controls are absent from the reader content.
7. Exercise Comfortable and Dyslexia-friendly visual presets, appearance, text-size, and spacing controls.
8. Close with the visible close control, reopen, and close with Escape.
9. Confirm keyboard focus is visible and remains in the modal reader while it is open.
10. Confirm copy places plain response text on the clipboard and print opens Chrome's print dialog with reader content.
11. Change preferences, close and reopen the reader, and confirm the preferences persist.
12. Navigate to another conversation without a full page reload and wait for rendering; confirm there is still exactly one injected button.
13. Trigger a new or streaming response; after completion, confirm optimizing selects the newest assistant response.
14. Open the popup on ChatGPT and confirm it reports support and opens the same reader flow.
15. Open the popup on an unrelated website and confirm it reports that the page is unsupported.
16. Visit Claude and Gemini and confirm their adapters fail safely without claiming extraction works.

## Security and content handling

- Manifest host access is limited to ChatGPT, Claude, and Gemini.
- The only requested Chrome permission is `storage`; host access is limited to the three configured sites.
- Extraction clones the selected response; it does not mutate the host response.
- Host controls are removed before DOMPurify applies a conservative element and attribute allowlist.
- Reader links are given `target="_blank"` and `rel="noopener noreferrer"` after sanitization.
- Extracted response HTML and text remain in memory for the active reader and are not written to storage.
- No remote code, JavaScript, fonts, telemetry, or network processing is used.

## Project structure

```text
src/
├── content/
│   ├── adapters/
│   │   ├── ConversationAdapter.ts
│   │   ├── ChatGPTAdapter.ts
│   │   ├── ClaudeAdapter.ts
│   │   ├── GeminiAdapter.ts
│   │   └── getActiveAdapter.ts
│   ├── index.ts
│   ├── injectButton.ts
│   ├── messages.ts
│   └── sanitize.ts
├── manifest/
│   └── manifest.ts
├── popup/
│   ├── index.html
│   ├── main.tsx
│   ├── Popup.tsx
│   └── popup.css
├── reader/
│   ├── mountReader.tsx
│   ├── ReaderView.tsx
│   └── reader.css
└── shared/
    ├── preferences.ts
    ├── storage.ts
    └── types.ts
tests/
```

Website extraction, injected controls, reader rendering, preferences, messaging, popup UI, and build configuration remain separate. The popup never duplicates extraction logic; both entry points send work through the content script's `optimizeLatest` function.

## Known limitations

- The ChatGPT DOM is private and changes over time. Live manual verification is pending, and selectors may require maintenance.
- Claude and Gemini are host-aware scaffolds only; they intentionally return no extracted response.
- Only the latest assistant response is supported. Full-conversation reading is out of scope.
- Reader output keeps the supported semantic HTML but does not retain host syntax highlighting, interactive widgets, diagrams, canvases, embedded media, or host-specific styling.
- Very complex tables can require horizontal scrolling.
- Copy uses the browser clipboard API with a local fallback and may be restricted by unusual browser or enterprise policies.
- Printing uses Chrome's browser print dialog; final pagination varies with printer settings.

## Roadmap

After live ChatGPT verification, the best next implementation step is to capture small, sanitized fixtures from several current ChatGPT response shapes and harden selector coverage against those cases. Only then should extraction be added and manually verified separately for Claude and Gemini.

Later roadmap candidates include full-conversation reading, conversation outlines, search, bookmarks, tags, highlights, notes, and export improvements. These features are not implemented in this MVP.
