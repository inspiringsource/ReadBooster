# ReadBooster

ReadBooster is a local-first Chrome extension that opens a ChatGPT conversation's assistant responses in a focused, full-screen reader overlay, starting with the latest response. The reader improves typography and spacing without rewriting, summarizing, reordering, or otherwise semantically editing the response.

> **Privacy:** ReadBooster processes content locally in your browser.

This repository contains the first MVP. ChatGPT extraction is implemented and covered by mock-DOM tests. Live Chrome verification is still required because ChatGPT's DOM is not a public or stable API.

## MVP scope

- Detect configured AI conversation sites.
- Inject one idempotent **Optimize Reading** control.
- Serialize optimization requests so rapid repeated activation cannot create duplicate readers.
- Extract and sanitize ChatGPT assistant responses in document order, opening the latest by default.
- Navigate between responses with Previous and Next controls without remounting the reader.
- Remove host controls and sanitize the cloned HTML with a conservative allowlist.
- Open a Shadow DOM-isolated full-screen reader overlay.
- Preserve paragraphs, headings, lists, links, blockquotes, code, tables, emphasis, and preformatted text.
- Give tables Fit, Wide, Fullscreen, Compact text, and Reset display controls for the current reader session.
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

| Website                      | Host access | Adapter implementation                               | Automated verification                    | Manual Chrome verification                  |
| ---------------------------- | ----------- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| ChatGPT (`chatgpt.com`)      | Configured  | Ordered assistant-response extraction and navigation | Mock DOM fixture tests                    | **Not yet verified** against the live site  |
| Claude (`claude.ai`)         | Configured  | Scaffold; safely returns `null` / `[]`               | Safe no-result behavior by implementation | Not verified; no extraction support claimed |
| Gemini (`gemini.google.com`) | Configured  | Scaffold; safely returns `null` / `[]`               | Safe no-result behavior by implementation | Not verified; no extraction support claimed |

“Functional” for ChatGPT describes the implemented adapter and automated fixture behavior, not a claim that the current live ChatGPT DOM has been manually verified. Selectors and assumptions that may require maintenance are commented in `ChatGPTAdapter.ts`.

Claude and Gemini are recognized as configured platforms, but ReadBooster does not inject an optimization control for them and the popup explicitly reports that support is not yet implemented.

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

### 0.2.2 scrolling and table regression checklist

1. Open a long response without tables and scroll from top to bottom.
2. Open a response with several tables and scroll through the entire response.
3. Horizontally scroll a table while the surrounding reader remains vertically scrollable.
4. Click Copy and confirm all table controls and modes remain visible.
5. Set a table to Wide, click Copy, and confirm it remains Wide.
6. Enable Compact text, click Copy, and confirm it remains enabled.
7. Open and close Fullscreen, then confirm normal reader scrolling still works.
8. Navigate Previous and Next and confirm scrolling works on both responses.
9. Close and reopen the reader and confirm ChatGPT itself scrolls normally afterward.
10. Confirm every table initially opens in Fit mode.

CSS layout and real scrolling dimensions cannot be fully validated by jsdom, so complete this checklist with mouse, trackpad, keyboard scrolling, scrollbar dragging, and representative Chrome zoom levels.

### Full MVP acceptance checklist

1. Build and load `dist/` using the instructions above.
2. Open a ChatGPT conversation with multiple assistant responses.
3. Confirm exactly one **Optimize Reading** button appears and is reachable by keyboard.
4. Click the injected button and confirm the latest—not the first—assistant response opens.
5. Use Previous and Next through every response; confirm the position label and disabled boundary controls are correct.
6. Change appearance, text size, spacing, and preset, then switch responses and confirm those preferences remain active.
7. Confirm paragraphs, headings, lists, links, blockquotes, inline code, code blocks, and tables remain semantically intact when present.
8. For a multi-column table, exercise Fit, Wide, Compact text, and Reset; confirm ordinary words are not broken in the middle and horizontal scrolling remains keyboard accessible.
9. Open a table Fullscreen, verify focus stays inside it, close with its control and Escape, and confirm focus returns to the Fullscreen button.
10. Switch away from and back to a response containing tables; confirm toolbars are not duplicated and session table settings remain active.
11. Confirm ChatGPT feedback, copy, audio, and action controls are absent from the reader content.
12. Close with the visible close control, reopen, and close with Escape.
13. Confirm keyboard focus is visible and remains in the modal reader while it is open.
14. Confirm copy places the active response's plain text on the clipboard and print opens Chrome's print dialog with reader content.
15. Change reader preferences, close and reopen the reader, and confirm the preferences persist.
16. Navigate to another conversation without a full page reload and wait for rendering; confirm there is still exactly one injected button.
17. Trigger a new or streaming response; after completion, confirm optimizing selects the newest assistant response.
18. Open the popup on ChatGPT and confirm it reports support and opens the same reader flow.
19. Open the popup on an unrelated website and confirm it reports that the page is unsupported.
20. Visit Claude and Gemini and confirm no page optimization button is injected and the popup reports that support is not yet implemented.

## Security and content handling

- Manifest host access is limited to ChatGPT, Claude, and Gemini.
- The only requested Chrome permission is `storage`; host access is limited to the three configured sites.
- Extraction clones assistant responses; it does not mutate the host conversation.
- Host controls are removed before DOMPurify applies a conservative element and attribute allowlist.
- Reader links are given `target="_blank"` and `rel="noopener noreferrer"` after sanitization.
- Extracted response HTML and text remain in memory for the active reader session and are not written to storage.
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
│   ├── optimization.ts
│   └── sanitize.ts
├── manifest/
│   └── manifest.ts
├── popup/
│   ├── index.html
│   ├── main.tsx
│   ├── Popup.tsx
│   └── popup.css
├── reader/
│   ├── blockControls.ts
│   ├── mountReader.tsx
│   ├── ResponseContent.tsx
│   ├── ReaderView.tsx
│   └── reader.css
└── shared/
    ├── preferences.ts
    ├── storage.ts
    └── types.ts
tests/
```

Website extraction, injected controls, reader rendering, preferences, messaging, popup UI, and build configuration remain separate. The popup never duplicates extraction logic; both entry points use the content script's serialized optimization service.

## Known limitations

- The ChatGPT DOM is private and changes over time. Live manual verification is pending, and selectors may require maintenance.
- Claude and Gemini are host-aware scaffolds only; they intentionally return no extracted response.
- Responses are captured when the reader opens; new streamed responses do not appear until ReadBooster is reopened.
- Navigation is sequential only. There is no conversation-outline sidebar or combined editable conversation document.
- Reader output keeps the supported semantic HTML but does not retain host syntax highlighting, interactive widgets, diagrams, canvases, embedded media, or host-specific styling.
- Wide and complex tables intentionally use horizontal scrolling. Sticky headers depend on the source containing a semantic `thead`.
- Table display settings last only for the current reader session and are not persisted across conversations.
- ReadBooster does not provide arbitrary document editing or selected-text resizing.
- Copy uses the browser clipboard API with a local fallback and may be restricted by unusual browser or enterprise policies.
- Printing uses Chrome's browser print dialog; final pagination varies with printer settings.

## Roadmap

After live ChatGPT verification, the best next implementation step is to capture small, sanitized fixtures from several current ChatGPT response shapes and harden selector coverage against those cases. Only then should extraction be added and manually verified separately for Claude and Gemini.

Later roadmap candidates include a combined full-conversation view, conversation outlines, search, bookmarks, tags, highlights, notes, and export improvements. These features are not implemented in this MVP.
