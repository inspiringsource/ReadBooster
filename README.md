# ReadBooster

ReadBooster 0.4.3 is a local-first Chrome extension that renders a normalized ChatGPT conversation as one calm, continuous document. The established single-response reader remains available as Focus mode. Both presentations improve typography and spacing without rewriting, summarizing, reordering, or otherwise semantically editing source content.

> **Privacy:** ReadBooster processes content locally in your browser.

This repository contains the first MVP. ChatGPT extraction is implemented and covered by mock-DOM tests. Live Chrome verification is still required because ChatGPT's DOM is not a public or stable API.

## MVP scope

- Detect configured AI conversation sites.
- Inject one idempotent **Optimize Reading** control.
- Serialize optimization requests so rapid repeated activation cannot create duplicate readers.
- Extract and sanitize ChatGPT prompts and assistant responses into a platform-neutral conversation document.
- Open in continuous Document mode by default, with every valid assistant response rendered chronologically.
- Preserve the 0.3.1 single-response experience as Focus mode, including Previous and Next navigation.
- Provide a grouped conversation outline in Document mode and the existing active-response outline in Focus mode.
- Keep associated prompts available through collapsed, accessible disclosures.
- Remove host controls and sanitize the cloned HTML with a conservative allowlist.
- Open a Shadow DOM-isolated full-screen reader overlay.
- Preserve paragraphs, headings, lists, links, blockquotes, safe response images/charts, code, tables, emphasis, and preformatted text.
- Add response-local code toolbars with language labels, exact Copy code, and optional locally bundled syntax color.
- Give tables Fit, Wide, Fullscreen, Compact text, and Reset display controls for the current reader session.
- Organize reader controls into direct mode, outline, and close controls plus compact Reading settings and Actions panels.
- Offer light, dark, and system appearance; text-size and spacing controls; Comfortable and Dyslexia-friendly visual presets; independent Color/Plain code appearance; a Latest section/Beginning opening preference; mode-specific copy and print; concise About/version information; visible focus; and Escape-key closing.
- Store only validated reader preferences in `chrome.storage.local`.
- Provide a small popup that reports page support and calls the same content-script operation as the injected button.

ReadBooster has no backend, account system, analytics, remote assets, AI API, or conversation-content persistence. It does not send extracted content over the network.

## Technology stack

- TypeScript and React for typed extension and reader UI code
- Vite for development and production bundling
- Chrome Manifest V3
- `@crxjs/vite-plugin` for a lightweight Vite-to-MV3 build pipeline
- DOMPurify for maintained browser-side HTML sanitization
- Highlight.js core with a deliberately registered language subset for local syntax highlighting
- Vitest, jsdom, and Testing Library for focused DOM unit tests
- ESLint and Prettier for code quality and formatting conventions

No background service worker is present because the popup can communicate directly with the content script and preferences can be stored directly from extension contexts.

## Normalized conversation foundation

The ChatGPT adapter's principal extraction result is a `ConversationDocument`. It contains a source URL, optional safely obtained title, extraction timestamp, and chronological `ConversationTurn` records. Each turn can contain a user prompt, an assistant response, or either side alone so streaming and unusual DOM transitions fail safely. Content blocks carry explicit roles, stable host message IDs when available, deterministic fallback IDs otherwise, and immutable original-source provenance with a content fingerprint.

Sanitized element and heading IDs are namespaced with the stable content-block ID. This keeps source ID and table `headers` relationships valid while ensuring that identically named headings in separate responses remain unique in a future multi-block DOM.

The reader derives a platform-neutral presentation model from this document once per conversation. Turns without assistant content are excluded safely. Each eligible turn becomes a stable document section containing the associated prompt, response, response-local semantic outline, and a deterministic title.

## Document and Focus modes

Document mode remains the default. It renders all assistant responses as restrained chapters within one paper-like reading surface labelled `Section 1`, `Section 2`, and so on. Section titles use the first meaningful response heading, then a shortened user prompt, then `Response 1`, `Response 2`, and so on. ReadBooster normalizes repeated whitespace and conservative leading numbering or bullets in its derived titles while leaving the original response heading unchanged. Titles are local, deterministic, and limited to approximately 80 characters. The grouped conversation outline contains one top-level destination per response, including responses without headings. Response headings remain nested within their own group and never inherit hierarchy from another response.

Associated prompts are collapsed under **View prompt** and are visually subordinate to the assistant document. They remain local and use the already-sanitized normalized prompt block. Prompt state, the selected reader mode, outline groups, and document scroll position are not persisted across reader sessions.

Focus mode preserves the 0.3.1 reader: one assistant response, Previous and Next, response position, active-response outline, responsive drawer, Copy, Print, preferences, and table controls. Switching to Focus uses the active document section where possible. Returning to Document restores its prior scroll position when practical. Reading preferences and response-specific table session state are shared across both modes.

Copy and Print follow the active mode. Document Copy creates a simple assistant-only text document containing each derived section title and response text; prompt bodies are excluded. Document Print includes all assistant sections and section labels while excluding prompts, outlines, header panels, and application/table controls. Focus Copy and Print remain scoped to the focused response.

The persisted **Open document at** setting controls only initial Document-mode positioning. **Latest section** (the default for new and migrated preferences) opens at the final eligible section title, not the bottom of its response. **Beginning** selects the first section. Subsequent user scrolling and the existing Document/Focus scroll-restoration behavior are not overridden by rerenders.

## Safe visual content and code readability

ReadBooster 0.4.3 preserves meaningful response images and generated canvas charts in their approximate source position. The ChatGPT adapter inspects only media inside extracted response content, excludes elements inside host controls, converts readable canvases locally to PNG data URLs, and emits platform-neutral `figure`, `img`, and optional `figcaption` markup. Safe PNG/JPEG/GIF/WebP data URLs, same-page Blob URLs, and already-present HTTPS image sources are accepted; unsafe schemes, raw SVG, scripts, event handlers, host widgets, and arbitrary controls remain excluded. Semantic Copy contains image alternative text and captions, never binary image data. Responsive reader and print CSS keep captured charts within the viewport or printable page width without dark-mode inversion.

Canvas capture can fail when its bitmap is unavailable or origin-restricted. In that case ReadBooster preserves surrounding prose and code and inserts the restrained text “Visual could not be captured.” It does not fetch or screenshot an entire host widget. Meaningful raw SVG is not admitted through the sanitizer; a verified chart container currently follows the same safe-failure path because SVG also represents many ChatGPT interface icons.

Every block-level code section receives a local enhancement toolbar with its explicit language and **Copy code**. Copy preserves the code text, line breaks, and indentation and excludes prose and the language label. Color mode lazily loads a selected Highlight.js bundle for Python, JavaScript, TypeScript, JSON, HTML, CSS, shell, SQL, and Markdown. Unsupported or unlabeled code remains readable plain code without guessing. Plain mode removes color tokens while preserving the code block and horizontal scrolling. Code appearance is persisted independently of typography presets. ReadBooster does not add Run and never executes response code.

## Reader header and About

ReadBooster 0.4.1 introduced a reader header separated into product identity, the always-visible Document/Focus switch, direct Outline and Close controls, and two small popover panels. **Reading settings** contains Preset, Appearance, Text size, and Spacing without changing their existing local persistence. **Actions** contains mode-specific Copy and Print plus concise About information. The identity line displays `Beta` and the current version derived from `package.json`, the same source used by the Chrome manifest.

Only one header panel can be open. Escape closes it before closing the reader, outside clicks dismiss it, and focus returns to its trigger. Focus navigation occupies an intentional secondary toolbar row so Previous, response position, and Next remain aligned at laptop widths. Opening these panels does not remount response content or reset prompts, tables, outlines, or document scroll state.

## Branding and extension icons

ReadBooster 0.4.2 declares dedicated PNG icons for the Chrome extension at 16×16, 32×32, 48×48, and 128×128. Runtime assets live in `public/icons/` and are copied to `dist/icons/`; the manifest uses them for both the extension identity and toolbar action. The compact popup uses the 32×32 icon beside its existing wordmark without changing popup behavior.

The source artwork and original website favicon bundle live in `branding/website-favicon/`, outside Vite's runtime `public/` package. The 512×512 PNG is the extension source artwork. The small 16×16 and 32×32 icons deliberately simplify the artwork to the bookmark/arrow mark, while 48×48 and 128×128 retain the full document design. The corrected `site.webmanifest` is retained only for a possible future ReadBooster website and is not the Chrome extension manifest.

To replace the icons later, begin with a square high-resolution source, preserve transparent safe padding, regenerate every PNG at its exact declared size, inspect the two smallest variants independently, run `npm run build`, and confirm every path and dimension in `dist/manifest.json`. SVG artwork may remain as a source, but Chrome manifest icon entries must continue referencing PNG files only.

## Website and adapter status

| Website                      | Host access | Adapter implementation                                                    | Automated verification                    | Manual Chrome verification                  |
| ---------------------------- | ----------- | ------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| ChatGPT (`chatgpt.com`)      | Configured  | Normalized turns with continuous Document and single-response Focus modes | Compact mock DOM and reader tests         | **Not yet verified** against the live site  |
| Claude (`claude.ai`)         | Configured  | Scaffold; safely returns `null` / `[]`                                    | Safe no-result behavior by implementation | Not verified; no extraction support claimed |
| Gemini (`gemini.google.com`) | Configured  | Scaffold; safely returns `null` / `[]`                                    | Safe no-result behavior by implementation | Not verified; no extraction support claimed |

“Functional” for ChatGPT describes the implemented adapter and automated fixture behavior, not a claim that the current live ChatGPT DOM has been manually verified. Selectors and assumptions that may require maintenance are commented in `ChatGPTAdapter.ts`.

Claude and Gemini are recognized as configured platforms, but ReadBooster does not inject an optimization control for them and the popup explicitly reports that support is not yet implemented.
Gemini remains scaffold-only in 0.4.3; this release does not add an adapter.

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
4. Click the injected button and confirm Document mode opens with every eligible assistant response once, in chronological order.
5. Switch to Focus, then use Previous and Next through every response; confirm the position label and disabled boundary controls are correct.
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

### 0.2.3 print and PDF checklist

1. Print a response with no table.
2. Print a two-column table in Portrait.
3. Print a six-column table in Portrait and confirm no columns are clipped.
4. Switch the screen table to Wide, scroll horizontally, then print and confirm the entire table appears.
5. Test Compact text before printing.
6. Test Landscape manually for a wide table.
7. Confirm table headers repeat when the table spans pages, where Chrome supports it.
8. Cancel printing and confirm the live reader remains unchanged.
9. Print twice and confirm no duplicate styles or controls appear.
10. Save as PDF and inspect every page.

### 0.3.0 normalized conversation and Focus-outline regression checklist

1. Open a conversation containing several prompt/response turns, switch to Focus, and confirm the selected assistant response renders alone.
2. Navigate Previous and Next and confirm the response count, content, and outline rebuild for each active response.
3. Confirm the outline uses only real `h1`–`h6` headings, preserves their nesting, and does not create entries from paragraphs.
4. Select every outline item and confirm its heading scrolls into view inside the reader while wide tables retain independent horizontal scrolling.
5. Scroll through a long headed response and confirm the current outline section changes appropriately.
6. Open a response without headings and confirm the concise empty state appears.
7. Open and close the outline using keyboard controls and confirm focus remains trapped in the reader with visible focus styling.
8. At a narrow Chrome window width, confirm the outline starts collapsed and opens as a responsive drawer without disabling reader scrolling.
9. Change table modes, open and close the outline, and switch away and back; confirm table controls are not duplicated and session state survives.
10. Print or save as PDF and confirm the outline and its controls are absent while the active response and tables retain the verified 0.2.3 layout.
11. Exercise a streaming response and a conversation with an incomplete turn; confirm extraction fails safely and no stale duplicate outline items appear.

### 0.4.0 continuous document regression checklist

1. Open a two-response conversation and confirm Document mode renders both responses once in chronological order.
2. Open a conversation with at least ten responses and check scrolling, outline calmness, and responsiveness.
3. Read several long responses from top to bottom without document-level horizontal overflow.
4. Confirm responses without headings receive prompt-derived or numbered section titles and remain navigable.
5. Confirm missing prompts and incomplete prompt-only turns do not create empty document sections.
6. Expand and collapse several prompts independently; confirm every prompt starts collapsed.
7. Switch between Document and Focus and confirm the active response and prior document scroll position are preserved where practical.
8. In Focus mode, navigate every response with Previous and Next and verify position boundaries.
9. Navigate with grouped response titles and nested heading destinations in the Document outline.
10. Scroll the document and confirm the active response group and active heading update accurately.
11. At a narrow window width, open the outline drawer, select destinations, and confirm it closes without disabling vertical scrolling.
12. Open multiple tables across several responses and verify each receives one toolbar and its own horizontal scroller.
13. Set different Fit, Wide, and Compact states on tables in separate responses and switch modes.
14. Open fullscreen tables from different responses, confirm only one remains open, and verify focus restoration.
15. Copy in both modes; confirm Document excludes prompt bodies and Focus copies only the focused response.
16. Print and Save as PDF in both modes; confirm Document includes every assistant section while prompts, outlines, and controls are absent.
17. Close and reopen the reader; confirm transient mode, prompt, outline, and table session state resets safely.
18. After closing, confirm normal ChatGPT scrolling and focus are restored.
19. Repeat representative Document, outline, table, and Focus checks at several Chrome zoom levels.
20. Confirm the continuous-document behavior remains intact after the current patch.

### 0.4.1 header refinement acceptance checklist

1. Test Document mode in a 13-inch MacBook Air-sized Chrome window and confirm the header groups remain aligned.
2. Test Focus mode at the same width and confirm its navigation occupies one intentional secondary row.
3. Test a wider desktop layout and confirm identity, mode, settings, actions, outline, and close remain distinct.
4. Test the narrow layout and confirm the outline still opens as a drawer without blocking document scrolling.
5. Open Reading settings, change every preference, close it, and confirm persistence still works.
6. Open Actions and exercise Copy, Print, and About in both reader modes where applicable.
7. Press Escape with each panel open and confirm the panel closes before the reader.
8. Close each panel from its trigger and by clicking outside; confirm focus restoration remains understandable.
9. In Focus mode, navigate Previous and Next through all response boundaries.
10. Switch repeatedly between Document and Focus and confirm active response and document scroll restoration.
11. Open responses headed `1. Title`, `1) Title`, `(1) Title`, and a bullet; confirm only the derived title loses the enumeration.
12. Change table modes, then open and close both header panels and confirm table state and controls remain unchanged.
13. Inspect print preview in both modes and confirm all header controls, panels, version labels, About content, prompts, outlines, and table controls are excluded.
14. Repeat the header, panel, navigation, drawer, table, and print checks at 80%, 100%, 125%, and 150% Chrome zoom.

### 0.4.2 extension branding acceptance checklist

1. Inspect the toolbar icon at normal and Retina display scaling.
2. Check the toolbar icon against both light and dark Chrome toolbar themes.
3. Inspect the branded 128×128 identity icon on `chrome://extensions`.
4. Open the popup and confirm its compact icon, status, privacy message, and Optimize behavior remain correct.
5. Repeat toolbar and popup checks at 80%, 100%, 125%, and 150% browser scaling.
6. Inspect `dist/manifest.json` and confirm every declared extension and action icon path resolves.
7. Confirm Chrome does not show a generic placeholder icon in the toolbar or extension-management page.
8. Recheck existing Document and Focus reader behavior after loading the branded build.

### 0.4.3 content fidelity and opening acceptance checklist

1. Reopen the Napoleon chart response that exposed the regression and confirm the chart is present.
2. Confirm the chart remains between its surrounding prose and Python code.
3. Inspect charts in light and dark reader appearances; confirm intrinsically light charts are not inverted.
4. Print and Save as PDF in Document and Focus modes; confirm charts fit without clipping and captions stay nearby.
5. Open a conversation with charts in separate responses and confirm none collide or duplicate.
6. Open a response containing only an image and confirm it remains an eligible document section.
7. Inspect Python syntax coloring and its language label in several code blocks.
8. Select Plain code appearance and confirm structure, whitespace, and horizontal scrolling remain intact.
9. Copy code, save it manually outside ReadBooster, and run it only in an environment you trust; confirm ReadBooster itself never executes it.
10. Exercise several code blocks in one response and confirm each receives exactly one correctly associated toolbar.
11. Select **Latest section**, close and reopen the reader, and confirm it opens at the final section title rather than its bottom.
12. Select **Beginning**, close and reopen, and confirm the first section is active.
13. Change each opening preference, reopen again, and confirm local persistence.
14. Switch Document/Focus repeatedly and confirm existing document-scroll restoration remains intact.
15. Exercise Fit, Wide, Fullscreen, Compact text, and Reset to confirm table behavior is unaffected.
16. Repeat chart, code, opening, mode, and table checks at Chrome zoom levels from 80% through 150%.

## Security and content handling

- Manifest host access is limited to ChatGPT, Claude, and Gemini.
- The only requested Chrome permission is `storage`; host access is limited to the three configured sites.
- Extraction clones user prompts and assistant responses into an in-memory normalized document; it does not mutate the host conversation.
- Host controls are removed before DOMPurify applies a conservative element and attribute allowlist.
- Reader links are given `target="_blank"` and `rel="noopener noreferrer"` after sanitization.
- Extracted response HTML and text remain in memory for the active reader session and are not written to storage.
- No remote code, JavaScript, fonts, telemetry, or network processing is used.

## Project structure

```text
branding/
└── website-favicon/       # Future website assets and 512×512 source artwork
public/
└── icons/                 # Runtime Chrome extension PNG icons
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
│   ├── codeControls.ts
│   ├── ContinuousDocumentView.tsx
│   ├── ConversationOutline.tsx
│   ├── FocusResponseView.tsx
│   ├── mountReader.tsx
│   ├── outline.ts
│   ├── presentation.ts
│   ├── PromptDisclosure.tsx
│   ├── ResponseOutline.tsx
│   ├── ResponseContent.tsx
│   ├── ReaderView.tsx
│   ├── syntaxHighlight.ts
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
- Document mode is intentionally non-virtualized in 0.4.0. Virtualization remains a future option only if real conversations demonstrate a need.
- Generated canvas charts are preserved only when local `toDataURL()` capture succeeds. Origin-restricted or unavailable bitmaps fall back to an accessible notice; arbitrary SVG, interactive artifacts, video, audio, host controls, and host-specific styling remain excluded.
- HTTPS response images are retained from existing response markup but are never fetched separately by extraction. Their later availability can still depend on the original URL and browser cache or access policy.
- Wide and complex tables intentionally use horizontal scrolling. Sticky headers depend on the source containing a semantic `thead`.
- Print output normalizes tables to the printable page width. Especially dense tables may remain easier to read when Landscape is selected manually in Chrome's print dialog.
- Table display settings last only for the current reader session and are not persisted across conversations.
- ReadBooster 0.4.3 does not provide search, bookmarks, annotations, editing, AI revisions, code execution, selective print/export, additional extracting platform adapters, or persistence of transient document-mode state. Search remains a future feature; no placeholder or inactive search control is included.
- Copy uses the browser clipboard API with a local fallback and may be restricted by unusual browser or enterprise policies.
- Printing uses Chrome's browser print dialog; final pagination varies with printer settings.

## Roadmap

After live ChatGPT verification, the best next implementation step is to capture small, sanitized fixtures from several current ChatGPT response shapes and harden selector coverage against those cases. Only then should extraction be added and manually verified separately for Claude and Gemini.

Later roadmap candidates include search, bookmarks, annotations, editing, AI-assisted revisions, selective print/export, and separately verified platform adapters. These features are not implemented in 0.4.3.
