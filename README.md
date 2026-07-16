# ReadBooster

ReadBooster 0.5.0 is a local-first Chrome extension that renders normalized ChatGPT and Gemini conversations as calm, continuous documents. The established single-response reader remains available as Focus mode. Both presentations improve typography and spacing without rewriting, summarizing, reordering, or otherwise semantically editing source content.

> **Privacy:** ReadBooster processes content locally in your browser. It stores reader preferences and user-created section-title overrides, but never persists prompt or response bodies. Feedback embeds an external Tally form only after the user selects **Feedback**; ReadBooster does not automatically send chat content, conversation identifiers, or the source URL.

This repository contains the first MVP. ChatGPT and Gemini extraction are implemented and covered by compact DOM fixtures. ChatGPT is manually verified; Gemini live Chrome verification remains required because neither platform's conversation DOM is a public or stable API.

## MVP scope

- Detect configured AI conversation sites.
- Inject one idempotent **Optimize Reading** control.
- Serialize optimization requests so rapid repeated activation cannot create duplicate readers.
- Extract and sanitize ChatGPT and Gemini prompts and assistant responses into one platform-neutral conversation model.
- Open in continuous Document mode by default, with every valid assistant response rendered chronologically.
- Preserve the 0.3.1 single-response experience as Focus mode, including Previous and Next navigation.
- Provide a grouped conversation outline in Document mode and the existing active-response outline in Focus mode.
- Keep associated prompts available through collapsed, accessible disclosures.
- Remove host controls and sanitize the cloned HTML with a conservative allowlist.
- Open a Shadow DOM-isolated full-screen reader overlay.
- Preserve paragraphs, headings, lists, links, blockquotes, verified safe response images, the tested ChatGPT Estuary chart-card structure, code, tables, emphasis, and preformatted text through the shared reader.
- Add response-local code toolbars with language labels, exact Copy code, and optional locally bundled syntax color.
- Give tables Fit, Wide, Fullscreen, Compact text, and Reset display controls for the current reader session.
- Organize reader controls into direct mode, outline, and close controls plus compact Reading settings and Actions panels.
- Offer a discreet, user-initiated **Feedback** action that displays the published Tally form in an accessible modal without changing the reader.
- Offer light, dark, and system appearance; text-size and spacing controls; Comfortable and Dyslexia-friendly visual presets; independent Color/Plain code appearance; a Latest section/Beginning opening preference; mode-specific copy and print; concise About/version information; visible focus; and Escape-key closing.
- Store only validated reader preferences and minimal section-title override metadata in `chrome.storage.local`.
- Open immediately from the current platform DOM window, then use the shared bounded source-page scanner when a verified overflowing conversation scroller exists.
- Provide a small popup that reports page support and calls the same content-script operation as the injected button.

ReadBooster has no backend, account system, analytics, remote assets, AI API, or conversation-body persistence. It does not send extracted content over the network.

### Feedback in 0.4.10

**Actions → Feedback** is available in both Document and Focus modes, including the narrow header layout. Direct activation opens an accessible ReadBooster modal containing a titled iframe for `https://tally.so/r/QKWqjp`; the reader stays mounted and inert behind a restrained overlay. The modal reports loading, closes with its visible Close control or Escape, traps focus, and restores focus to Feedback. If the frame reports an error or does not load within 15 seconds, a fallback can open the same plain URL in a new tab with `noopener,noreferrer`.

ReadBooster does not load Tally's remote widget script, call `Tally.openPopup()`, inspect submitted iframe content, or persist form contents. The iframe URL contains no prompt, response, title, source URL, conversation ID, selected text, screenshot, or automatically added metadata, and the form is not contacted before explicit activation. The user decides what to enter or upload to Tally; avoid including private chat information in feedback text, screenshots, or other attachments.

No manifest change was required for the iframe. The extension continues using Chrome's default Manifest V3 extension-page CSP, requests no Tally host permission, and retains only the existing `storage` permission. Tally's current response has no `X-Frame-Options` or `frame-ancestors` response restriction, but live Chrome acceptance remains necessary because external framing behavior can change independently of ReadBooster.

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

Each implemented adapter's principal extraction result is a `ConversationDocument`. It contains a source URL, optional safely obtained title, extraction timestamp, and chronological `ConversationTurn` records. Each turn can contain a user prompt, an assistant response, or either side alone so streaming and unusual DOM transitions fail safely. Content blocks carry explicit roles, stable host message IDs when available, deterministic fallback IDs otherwise, and immutable original-source provenance with a content fingerprint.

Sanitized element and heading IDs are namespaced with the stable content-block ID. This keeps source ID and table `headers` relationships valid while ensuring that identically named headings in separate responses remain unique in a future multi-block DOM.

The reader derives a platform-neutral presentation model from this document once per conversation. Turns without assistant content are excluded safely. Each eligible turn becomes a stable document section containing the associated prompt, response, response-local semantic outline, and a deterministic title.

### Conversation completeness in 0.4.5

ReadBooster collects candidates from every supported ChatGPT selector family before canonicalization. Individual message containers are kept in DOM order, nested role markers are collapsed to one message, and duplicate SPA representations are removed only when they share the same stable `data-message-id`. Repeated generic `data-testid` values, similar text, and similar markup are not treated as message identity. A missing prompt or one incomplete response does not remove later valid assistant responses.

There is no response-count cap in the normalized model or presentation. Document mode, its grouped outline, Document Copy, and Document Print consume every derived assistant section. Focus Previous and Next use that same complete response collection, and **Latest section** selects its actual final entry. A development-only, in-memory count helper covers raw user/assistant candidates, canonical and deduplicated candidates, extracted assistant blocks, normalized turns, derived sections, and rendered sections. It records no text, URLs, identifiers, timing, or persistent data.

### Conversation refresh and accumulation in 0.4.6

The initial reader document remains a normalized adapter snapshot, but it is no longer immutable for the lifetime of the open reader. In Document mode, **Actions → Refresh conversation** asks the active adapter for a fresh live-DOM snapshot and passes it through a pure normalized-document merge. The accumulated in-memory `ConversationDocument` then drives Document and Focus rendering, outlines, Copy, and Print. The reader never queries ChatGPT selectors itself, does not close or remount, and never writes conversation content to storage.

The merge uses stable original-source message IDs first and stable normalized block IDs second. Overlapping identities act as chronological anchors, allowing newly discovered earlier or later turns to be inserted while preserving existing turns missing from the newer snapshot. Identical snapshots are idempotent. A richer matching extraction may complete a streaming block, but empty, shorter, or media-losing content cannot replace a richer existing block. If two snapshots have no stable overlap, existing content is preserved first and disjoint incoming content is appended rather than guessing chronology or collapsing similar prose.

Refreshing preserves stable response section keys, the active section or heading viewport offset, open prompt disclosures, table state and horizontal position, outline state, preferences, and the current Focus response where applicable. Status is announced accessibly while the reader remains usable. The accumulated document and status timers are discarded when the reader unmounts.

ReadBooster 0.4.6 intentionally provided manual refresh only. It did not poll, rescan on every mutation, or automatically reparse during reader scrolling. Live testing subsequently confirmed that another current-DOM snapshot was insufficient when ChatGPT virtualized turns around the source-page scroll position.

### Virtualized conversation scanning in 0.4.7

The reader still mounts immediately from the adapter's fast current-window snapshot. Once per reader opening, the content/adapter layer starts one bounded scan of the validated ChatGPT conversation scroller. It saves the source scroll position, moves to the beginning, waits for a short mutation-quiet window, extracts through the existing normalized path, and merges each settled virtualized window before advancing by 75% of the source viewport. Scroll height is re-evaluated after every position so newly mounted earlier content and growing source geometry are handled. The original source position is restored from a `finally` cleanup path after success, timeout, failure, cancellation, reader closing, or conversation-identity mismatch.

The scan is bounded to 40 positions, 12 seconds, a 650 ms settling deadline per position, three top-stabilization passes, and three consecutive no-progress positions. It uses a scoped temporary `MutationObserver`, two animation frames, and a 90 ms quiet period rather than a permanent observer or polling loop. **Actions → Refresh conversation** runs the same scan; automatic and manual activation share the adapter's single in-flight operation. Progress reports counts only. The implementation never logs content or identifiers, never calls a private API, never issues a network request, and never persists a conversation.

The ChatGPT source scroller is selected as the nearest vertically overflowing ancestor shared by the currently mounted message candidates. It must contain the candidate turn elements, use scrollable vertical overflow, have meaningful viewport/scroll dimensions, and be outside the ReadBooster reader. `document.scrollingElement` is a validated fallback. If neither is reliable, ReadBooster keeps the current snapshot and reports that a full scan could not be completed instead of claiming completeness.

### Custom section titles in 0.4.8

Each top-level section row in the Conversation outline now has a subtle, keyboard-reachable **Rename section** control. Rename opens one inline plain-text field initialized with the displayed title. Enter or **Save** accepts a title; Escape or **Cancel** leaves the previous title unchanged and returns focus to the section's Rename control. Titles are whitespace-normalized, limited to 120 characters, rendered only as text, and may be duplicated. The Rename action remains visible through keyboard focus and on narrow or touch layouts rather than depending on hover alone.

A restrained dot identifies a **Custom title** visually and accessibly. **Restore automatic title** removes the override and immediately returns to the current deterministic heading/prompt/`Response N` title. The automatic title remains separately derived from the current normalized response, so restoration after Refresh uses the newest automatic title. Custom titles apply to the Conversation outline, Continuous Document section heading, Document Copy, and Document Print; they never replace the source response heading or alter Focus response content.

Overrides use stable platform `sourceConversationId` plus assistant `sourceMessageId` associations and are stored under the versioned `sectionTitleOverrides:v1` key. The platform prefix prevents a ChatGPT override from appearing in Gemini or another conversation. The array schema contains only a conversation association key, response association key, and normalized custom title. It stores no prompt, response text, HTML, source URL, chart, table, code, automatic title, or signed media URL. Malformed and prototype-polluting records are ignored. If either stable source identity is unavailable, the rename remains valid for the current reader session but is deliberately not persisted, preventing it from attaching to the wrong response later.

Preferences and the current conversation's overrides load in parallel before the first reader render. Refresh and virtualized scanning continue to merge only normalized source documents; presentation overrides stay separate and follow stable response identity when earlier or later turns are inserted. Renaming updates presentation labels without remounting response content or resetting scroll, outline, prompt, table, chart, or code state.

### Gemini conversation support in 0.5.0

Gemini now implements the same `ConversationAdapter` boundary as ChatGPT. It extracts a current DOM snapshot into chronological user and assistant blocks, pairs them through the shared normalized turn model, and hands that document to the existing Document/Focus reader. Compatibility response helpers derive from that document, the popup uses the same content-script status/optimization path, and Refresh requests a fresh adapter snapshot rather than querying Gemini from React.

Public, unauthenticated Gemini inspection on 16 July 2026 confirmed semantic Angular shell elements including `chat-app`, `chat-window`, `chat-window-content`, `assistant-messages-primary`, and `infinite-scroller`. An authenticated conversation was not available in this implementation session. The message contracts `user-query`, `model-response`, and `message-content`, plus their role/data-attribute fallbacks, are therefore reduced-fixture assumptions and are explicitly marked as maintenance-sensitive in `GeminiAdapter.ts`; they are implemented but not claimed as live manually verified.

The adapter prefers a `/app/{conversation-id}` URL segment or a stable `data-conversation-id`, then stable `data-message-id`, `data-query-id`, `data-response-id`, or `data-turn-id` message identity. Without a stable message identity it generates the existing deterministic index/content fallback and deliberately leaves custom-title persistence session-only. Stable identities drive refresh merging, response-local table/code keys, Focus navigation, and title-override ownership without using prompt or response text as deduplication evidence.

Supported fixture content includes headings, paragraphs, emphasis, links, nested lists, blockquotes, semantic tables, preformatted/code blocks, explicit Python/JavaScript/TypeScript/JSON and other existing local language mappings, restrained citations, and safe semantic response images. Gemini buttons, menus, feedback/share/audio controls, code-language headers, decorative SVG/icons, citation favicons, tracking counters, unsafe markup, and explicitly hidden or inactive drafts are removed before the shared sanitizer. Only the selected visible draft is eligible; ReadBooster does not add draft-selection UI.

Gemini uses the shared bounded source scanner only when mounted messages have a validated, vertically overflowing common ancestor. The scanner retains its existing cancellation, accumulation, limits, and source-scroll restoration. If no such scroller exists, Gemini returns an honest `single-snapshot` refresh result and performs no artificial traversal. Whether authenticated Gemini currently virtualizes conversation turns remains a live-testing question.

Interactive Gemini artifacts, canvases, arbitrary SVG graphics, embedded applications, and shadow-root-only output are not captured in 0.5.0. Safe semantic raster images already present in response content may be retained; private Gemini APIs, network interception, proxying, uploads, and code execution are never used.

## Document and Focus modes

Document mode remains the default. It renders all assistant responses as restrained chapters within one paper-like reading surface labelled `Section 1`, `Section 2`, and so on. Section titles use the first meaningful response heading, then a shortened user prompt, then `Response 1`, `Response 2`, and so on. ReadBooster normalizes repeated whitespace and conservative leading numbering or bullets in its derived titles while leaving the original response heading unchanged. Titles are local, deterministic, and limited to approximately 80 characters. The grouped conversation outline contains one top-level destination per response, including responses without headings. Response headings remain nested within their own group and never inherit hierarchy from another response.

Associated prompts are collapsed under **View prompt** and are visually subordinate to the assistant document. They remain local and use the already-sanitized normalized prompt block. Prompt state, the selected reader mode, outline groups, and document scroll position are not persisted across reader sessions.

Focus mode preserves the 0.3.1 reader: one assistant response, Previous and Next, response position, active-response outline, responsive drawer, Copy, Print, preferences, and table controls. Switching to Focus uses the active document section where possible. Returning to Document restores its prior scroll position when practical. Reading preferences and response-specific table session state are shared across both modes.

Copy and Print follow the active mode. Document Copy creates a simple assistant-only text document containing each derived section title and response text; prompt bodies are excluded. Document Print includes all assistant sections and section labels while excluding prompts, outlines, header panels, and application/table controls. Focus Copy and Print remain scoped to the focused response.

The persisted **Open document at** setting controls only initial Document-mode positioning. **Latest section** (the default for new and migrated preferences) opens at the final eligible section title, not the bottom of its response. **Beginning** selects the first section. Subsequent user scrolling and the existing Document/Focus scroll-restoration behavior are not overridden by rerenders.

## Safe visual content and code readability

ReadBooster 0.4.4 corrects the extraction boundary discovered through the live Napoleon regression. In the confirmed ChatGPT structure, a generated chart card is a preceding sibling of the assistant-role element under one immediate response wrapper, rather than a descendant of its `.markdown` prose root. The adapter now assembles verified sibling chart cards and the assistant prose into one normalized root in source order.

Support is intentionally limited to the tested structural combination: the card must precede the assistant message in the same immediate wrapper, expose a separate concise title, and contain one large same-origin raster image at `/backend-api/estuary/content`. Card buttons, menus, download/expand controls, SVG icons, empty decoration, Google favicon-service images, and citation/source thumbnails are excluded. The title becomes both the image alternative and figure caption. Loaded same-origin pixels are converted locally to a PNG data URL where possible; otherwise the already-rendered same-origin URL is retained only in the in-memory reader document for that session. Extraction does not issue a fetch or persist signed Estuary URLs.

Recognized citation pills are normalized to restrained inline source links without favicon images, unexplained `+1` UI, or tracking parameters. Semantic Copy retains their readable source text. The shared safe-media boundary continues to accept verified PNG/JPEG/GIF/WebP data URLs, same-page Blob URLs, and permitted HTTPS response-image sources while rejecting unsafe schemes, raw SVG, scripts, event handlers, arbitrary controls, and known citation favicons. Responsive reader and print CSS keep supported figures within screen and printable widths without applying destructive dark-mode inversion.

Canvas capture can fail when its bitmap is unavailable or origin-restricted. In that case ReadBooster preserves surrounding prose and code and inserts the restrained text “Visual could not be captured.” It does not fetch or screenshot an entire host widget. Meaningful raw SVG is not admitted through the sanitizer; a verified chart container currently follows the same safe-failure path because SVG also represents many ChatGPT interface icons.

Every block-level code section receives a local enhancement toolbar with its explicit language and **Copy code**. Copy preserves the code text, line breaks, and indentation and excludes prose and the language label. Color mode lazily loads a selected Highlight.js bundle for Python, JavaScript, TypeScript, JSON, HTML, CSS, shell, SQL, and Markdown. Unsupported or unlabeled code remains readable plain code without guessing. Plain mode removes color tokens while preserving the code block and horizontal scrolling. Code appearance is persisted independently of typography presets. ReadBooster does not add Run and never executes response code.

## Reader header and About

ReadBooster 0.4.1 introduced a reader header separated into product identity, the always-visible Document/Focus switch, direct Outline and Close controls, and two small popover panels. **Reading settings** contains Preset, Appearance, Text size, and Spacing without changing their existing local persistence. **Actions** contains mode-specific Copy and Print, Feedback, and concise About information. The identity line displays `Beta` and the current version derived from `package.json`, the same source used by the Chrome manifest.

Only one header panel can be open. Escape closes it before closing the reader, outside clicks dismiss it, and focus returns to its trigger. Focus navigation occupies an intentional secondary toolbar row so Previous, response position, and Next remain aligned at laptop widths. Opening these panels does not remount response content or reset prompts, tables, outlines, or document scroll state.

## Branding and extension icons

ReadBooster 0.4.2 declares dedicated PNG icons for the Chrome extension at 16×16, 32×32, 48×48, and 128×128. Runtime assets live in `public/icons/` and are copied to `dist/icons/`; the manifest uses them for both the extension identity and toolbar action. The compact popup uses the 32×32 icon beside its existing wordmark without changing popup behavior.

The source artwork and original website favicon bundle live in `branding/website-favicon/`, outside Vite's runtime `public/` package. The 512×512 PNG is the extension source artwork. The small 16×16 and 32×32 icons deliberately simplify the artwork to the bookmark/arrow mark, while 48×48 and 128×128 retain the full document design. The corrected `site.webmanifest` is retained only for a possible future ReadBooster website and is not the Chrome extension manifest.

To replace the icons later, begin with a square high-resolution source, preserve transparent safe padding, regenerate every PNG at its exact declared size, inspect the two smallest variants independently, run `npm run build`, and confirm every path and dimension in `dist/manifest.json`. SVG artwork may remain as a source, but Chrome manifest icon entries must continue referencing PNG files only.

## Website and adapter status

| Website                      | Host access | Adapter implementation                                                    | Automated verification                          | Manual Chrome verification                        |
| ---------------------------- | ----------- | ------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| ChatGPT (`chatgpt.com`)      | Configured  | Normalized turns with continuous Document and single-response Focus modes | Compact live-derived fixtures and reader tests  | Implemented and manually verified                 |
| Gemini (`gemini.google.com`) | Configured  | Normalized turns using the shared Document and Focus reader               | Reduced semantic fixtures and integration tests | **Pending** against an authenticated conversation |
| Claude (`claude.ai`)         | Configured  | Scaffold; safely returns `null` / `[]`                                    | Safe no-result behavior by implementation       | Not verified; no extraction support claimed       |

Gemini's public app-shell elements were inspected, but its authenticated message selectors and dynamic conversation behavior remain manually unverified. `GeminiAdapter.capabilities.manuallyVerified` therefore remains `false`. Claude remains a configured scaffold and does not receive an Optimize Reading control.

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
6. Open ChatGPT at `https://chatgpt.com/` or Gemini at `https://gemini.google.com/`.
7. Refresh the page if necessary.
8. Open a conversation containing an assistant response.
9. Click **Optimize Reading**.

After rebuilding, use the reload control on the ReadBooster card in `chrome://extensions`, then refresh the platform tab.

## Manual acceptance test

Automated tests deliberately use compact fixtures rather than reproducing a brittle copy of the live ChatGPT DOM. ChatGPT is manually verified; retain this checklist for regression acceptance after extraction or reader changes:

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
20. Visit Gemini and confirm its optimization control and popup support are available; visit Claude and confirm no optimization button is injected and the popup reports that extraction is not implemented.

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

### 0.4.4 live chart and content-fidelity acceptance checklist

1. Reopen the Napoleon chart response that exposed the regression and confirm the chart is present.
2. Confirm the chart appears once before the explanatory prose, matching the live ChatGPT order.
3. Confirm no red `mass:werk` or `datavizblog.com` favicon thumbnail appears.
4. Confirm both sources remain available as restrained inline text citations without unexplained `+1` UI.
5. Confirm citations do not interrupt the surrounding paragraph flow.
6. Confirm the code toolbar says **Python**.
7. Confirm the code body begins with `import matplotlib.pyplot as plt` and contains no standalone host `Python` label.
8. Confirm Color syntax highlighting activates for the Python block.
9. Copy the code and confirm exact line breaks and indentation are preserved without the language label.
10. Test the response in both Document and Focus modes.
11. Select **Latest section**, close and reopen the reader, and confirm the final eligible section title is visible.
12. Print and Save as PDF in both modes; confirm the chart fits without clipping and its caption stays nearby.
13. Inspect the chart and citations in light and dark reader appearances.
14. Exercise Fit, Wide, Fullscreen, Compact text, and Reset to confirm table behavior is unaffected.
15. Close and reopen the reader and confirm charts, citations, code controls, and table controls are not duplicated.
16. Repeat representative chart, code, mode, and table checks from 80% through 150% Chrome zoom.

### 0.4.5 conversation-completeness acceptance checklist

Automated 10- and 25-response fixtures prove the internal pipeline has no three-response cap, but they do not replace live Chrome acceptance.

1. Open a live ChatGPT conversation containing at least six assistant responses and count them in ChatGPT.
2. Open ReadBooster Document mode and confirm every available assistant response appears exactly once and in chronological order.
3. Confirm the conversation outline contains one group for every rendered response.
4. Navigate to the first, a middle, and the final response using the outline.
5. Switch to Focus and use Previous and Next through the complete response set; verify both disabled boundaries.
6. Select **Latest section**, close and reopen ReadBooster, and confirm the true final response title is visible.
7. Copy the Document and confirm the first through final assistant responses are present and prompts remain excluded.
8. Print or Save as PDF and confirm the first through final assistant sections are present.
9. Test a response without a user prompt and a response without headings; confirm both remain included.
10. Test a long conversation after scrolling ChatGPT from top to bottom, then repeat without pre-scrolling.
11. Repeat with an older saved conversation and a newly generated conversation.
12. Confirm tables, charts, code controls, citations, Copy, and Print remain response-scoped and are not duplicated.

### 0.4.6 conversation-refresh acceptance checklist

Synthetic merge and reader fixtures do not constitute final acceptance. Complete this checklist against live Chrome:

1. Open a ChatGPT conversation containing at least ten assistant responses without first scrolling through the whole source conversation.
2. Open ReadBooster and record its initial section count.
3. Open **Actions**, select **Refresh conversation**, and confirm the accessible checking state appears without blocking reading.
4. Confirm newly exposed responses are inserted once and in chronological order.
5. Refresh again and confirm the no-additional-responses status appears without duplicates.
6. Refresh while ChatGPT is completing a response, then refresh after completion and confirm the matching response updates safely.
7. Confirm the grouped outline gains every newly discovered response and heading.
8. Switch to Focus and navigate to the first and final accumulated responses.
9. Confirm the active section or heading and visible reading position remain stable when earlier turns are inserted.
10. Confirm prompt disclosures, table modes and horizontal positions, charts, code controls, and citations remain unchanged and unduplicated.
11. Confirm Document Copy and print preview contain the complete accumulated assistant document.
12. Repeat with the Napoleon demonstration conversation and confirm its chart remains associated with the correct response.
13. Record separately how many turns exist in ChatGPT, how many are present in its live DOM, and how many ReadBooster discovers before and after refresh.

### 0.4.7 virtualized-conversation scan acceptance checklist

Automated five-window fixtures prove bounded accumulation and cleanup, but they do not establish that the current private ChatGPT DOM behaves identically. Complete both starting-position runs in the same live conversation.

1. Open a live ChatGPT conversation containing at least five assistant responses and record the source count.
2. Scroll ChatGPT near the final response, activate **Optimize Reading**, and confirm the reader opens before scanning finishes.
3. Confirm the accessible `Scanning conversation…` status reports the growing discovered-response count.
4. Confirm the final Document contains responses 1 through 5 exactly once and in chronological order.
5. Close ReadBooster, scroll the same ChatGPT conversation near its first response, and activate **Optimize Reading** again.
6. Confirm the top-start scan produces the same five sections in the same order as the bottom-start scan.
7. Confirm ChatGPT returns to its original source scroll position after each scan.
8. Open **Actions**, select **Refresh conversation**, and confirm it performs a scan and reports `No additional responses found after scanning the conversation` when unchanged.
9. Refresh repeatedly and confirm no response, outline item, chart, table toolbar, or code toolbar is duplicated.
10. Switch to Focus and navigate from response 1 through response 5; verify both navigation boundaries.
11. Confirm the grouped outline, active section, Document Copy, and Document Print contain all five responses.
12. Begin a scan while reading a middle section and confirm newly inserted earlier turns do not move the visible reading anchor to the final response.
13. Close the reader during scanning and confirm the scan is cancelled and ChatGPT's original source position is restored.
14. Repeat with a response still streaming, then scan after it completes and confirm the richer matching block updates safely.
15. Recheck the Napoleon demonstration chart, citations, Python code toolbar, tables, prompts, light/dark appearance, and print preview.
16. Record the starting ChatGPT scroll position, mounted assistant count, final discovered count, and whether the scan reached the bottom for the manual acceptance notes.

### 0.4.8 custom section-title acceptance checklist

Automated storage and reader fixtures verify schema validation and UI behavior, but persistence acceptance requires closing and reopening ReadBooster on the same live ChatGPT conversation.

1. Open a multi-response ChatGPT conversation and complete the automatic source scan.
2. In the Conversation outline, hover a section row and confirm the restrained Rename pencil appears.
3. Tab through the same row and confirm Rename becomes visible with a clear focus indicator.
4. Rename a prompt-derived title with Enter; confirm whitespace is normalized and focus returns to Rename.
5. Rename another section with **Save**, then start and cancel another edit with both Escape and **Cancel**.
6. Attempt an empty and an over-120-character title; confirm the accessible validation message and previous title remain.
7. Confirm the custom-title indicator is visible and announced as `Custom title`.
8. Confirm the custom title appears in the Conversation outline, Document section heading, Document Copy, and Document print preview.
9. Confirm the original assistant heading and Focus response content remain unchanged.
10. Close and reopen ReadBooster on the same conversation; confirm the custom title reloads on the same response.
11. Open another ChatGPT conversation and confirm the custom title does not appear there.
12. Run **Refresh conversation** and confirm earlier or later inserted responses do not shift the custom title to another section.
13. Rename a section, then exercise prompts, charts, tables, code controls, outline expansion, Document/Focus switching, and scrolling; confirm none are reset or duplicated.
14. Select **Restore automatic title** and confirm the current derived title returns, the indicator disappears, focus is restored, and the override remains absent after reopening.
15. At a narrow or touch-sized layout, confirm Rename and Restore remain discoverable without hover.
16. Inspect `chrome.storage.local` and confirm `sectionTitleOverrides:v1` contains only association keys and custom title text, never prompt or response bodies.

### 0.4.10 feedback-modal acceptance checklist

Automated tests simulate iframe load and failure events and mock the fallback new-tab opening. They do not load or submit the external form. Final acceptance requires the live extension and Tally.

1. Reload the unpacked extension from `dist` and confirm `chrome://extensions` reports version 0.4.10.
2. Open ReadBooster in Document mode and locate **Actions → Feedback**.
3. Activate Feedback and confirm the Tally form appears inside the ReadBooster modal rather than opening a new tab.
4. Confirm the reader remains visible, mounted, and non-interactive behind the overlay.
5. Submit a clearly non-private test report and confirm it appears in Tally Submissions.
6. If Tally notifications are enabled, confirm the test submission notification arrives.
7. Close the modal with its Close button and confirm focus returns to Feedback.
8. Reopen the modal, press Escape, and confirm the same focus restoration.
9. Repeat from Focus mode and confirm the focused response remains unchanged.
10. Reach and operate the modal using the keyboard, including cycling focus without reaching the reader behind it.
11. Repeat at a narrow window width and confirm the modal fits within safe viewport margins.
12. Temporarily simulate or block iframe loading and confirm the failure message and exact new-tab fallback work.
13. Inspect the iframe and fallback URL; confirm no chat text, title, source URL, or conversation identifier was automatically included.
14. Recheck Continuous Document mode, both outlines, tables, Copy, Print, section renaming, and Refresh conversation.

### 0.5.0 Gemini acceptance checklist

Automated fixtures establish normalized behavior, not compatibility with Gemini's current authenticated DOM. Keep `manuallyVerified: false` until this checklist passes on `gemini.google.com`.

1. Open an existing Gemini conversation containing at least three prompt-response turns.
2. Confirm one keyboard-reachable **Optimize Reading** control appears.
3. Confirm the popup reports Gemini as supported and enables **Optimize latest response**.
4. Open ReadBooster from the injected control, close it, and repeat from the popup.
5. Confirm every available Gemini response appears exactly once and chronologically.
6. Confirm associated prompts are correct and collapsed by default.
7. Verify headings, nested lists, links, citations, blockquotes, code, and a semantic table.
8. Confirm Gemini copy, share, feedback, audio, model, menu, and draft controls are absent.
9. If Gemini exposes alternative drafts, confirm only the selected visible draft appears.
10. Test Document and Focus modes plus Previous/Next boundaries.
11. Test grouped and focused outlines, exact heading navigation, and active-section tracking.
12. Test Document and Focus Copy and inspect the semantic text.
13. Print and Save as PDF; verify prompts and interactive controls remain excluded.
14. Exercise Fit, Wide, Fullscreen, Compact text, and Reset on a Gemini table.
15. Test Color and Plain code appearances and exact Copy code for labelled and unlabelled blocks.
16. Rename a Gemini section, close and reopen ReadBooster, and confirm persistence only when stable identity is available.
17. Restore the automatic title and confirm source headings remain unchanged.
18. Generate a new Gemini response, then use **Refresh conversation** and confirm it is added or completed once.
19. Start Refresh while a response is streaming; confirm empty or shorter content does not replace richer captured content.
20. Navigate to another Gemini conversation without reloading the tab and confirm one control remains available.
21. Confirm content and custom titles never cross between Gemini conversations or between Gemini and ChatGPT.
22. Record whether Gemini virtualizes turns and whether top-start and bottom-start scans discover the same available set.
23. If scanning occurs, confirm Gemini returns to its original source scroll position after success, cancellation, and reader closing.
24. Test safe semantic response images; record unsupported interactive, canvas, SVG, iframe, or shadow-root artifacts honestly.
25. Open the Feedback modal and confirm it sends no Gemini prompt, response, title, ID, URL, or selected text automatically.
26. Test light and dark appearance, narrow width, and Chrome zoom from 80% through 150%.
27. Close ReadBooster and confirm Gemini scrolling, focus, input, and controls remain usable.
28. Record the Gemini URL shape, semantic message elements, stable IDs, selected-draft state, source scroller, SPA navigation behavior, and final pass/fail results.

## Security and content handling

- Manifest host access is limited to ChatGPT, Claude, and Gemini.
- The only requested Chrome permission is `storage`; host access is limited to the three configured sites.
- Extraction clones user prompts and assistant responses into an in-memory normalized document; it does not mutate the host conversation.
- Host controls are removed before DOMPurify applies a conservative element and attribute allowlist.
- Reader links are given `target="_blank"` and `rel="noopener noreferrer"` after sanitization.
- Extracted response HTML and text remain in memory for the active reader session and are not written to storage.
- `chrome.storage.local` contains validated reader preferences and optional `sectionTitleOverrides:v1` entries with stable conversation/response association keys plus user-created title text only.
- ChatGPT and Gemini extraction reads only the currently rendered page DOM; it does not call platform APIs, private conversation endpoints, intercept network traffic, or add authentication.
- No remote executable code is loaded into the extension execution context, and no telemetry or automatic Tally request is used. After explicit activation, the Tally web application runs only inside its isolated iframe; ReadBooster does not load Tally's widget script or inspect the iframe's submitted content.

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
│   │   ├── chatgptSourceScanner.ts
│   │   ├── ClaudeAdapter.ts
│   │   ├── GeminiAdapter.ts
│   │   ├── geminiSourceScanner.ts
│   │   └── getActiveAdapter.ts
│   ├── conversationDomScanner.ts
│   ├── index.ts
│   ├── conversationSourceScanner.ts
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
    ├── conversation.ts
    ├── developmentDiagnostics.ts
    ├── preferences.ts
    ├── sectionTitleOverrides.ts
    ├── storage.ts
    └── types.ts
tests/
```

Website extraction, injected controls, reader rendering, preferences, messaging, popup UI, and build configuration remain separate. The popup never duplicates extraction logic; both entry points use the content script's serialized optimization service.

## Known limitations

- ChatGPT and Gemini DOM structures are private and can change. ChatGPT is manually verified; Gemini's authenticated message selectors and behavior remain live-manual acceptance work.
- Claude is a host-aware scaffold only and intentionally returns no extracted response.
- ReadBooster scans mounted windows a supported platform exposes only after validating a shared overflowing source scroller. It cannot manufacture turns the platform never mounts, and it does not retrieve missing turns through private APIs. A single-snapshot fallback or bounded termination is not proof that no additional responses exist.
- Gemini alternative drafts are limited to the explicitly selected visible response. Interactive artifacts, canvases, arbitrary SVG, embedded applications, and shadow-root-only output are not captured in 0.5.0.
- The automatic bounded scan runs once per reader opening. A response mounted or completed later can be accumulated with **Actions → Refresh conversation**; there is no polling or permanent background observer.
- Document mode is intentionally non-virtualized in 0.4.0. Virtualization remains a future option only if real conversations demonstrate a need.
- Generated canvas charts are preserved only when local `toDataURL()` capture succeeds. Origin-restricted or unavailable bitmaps fall back to an accessible notice; arbitrary SVG, interactive artifacts, video, audio, host controls, and host-specific styling remain excluded.
- HTTPS response images are retained from existing response markup but are never fetched separately by extraction. Their later availability can still depend on the original URL and browser cache or access policy.
- Wide and complex tables intentionally use horizontal scrolling. Sticky headers depend on the source containing a semantic `thead`.
- Print output normalizes tables to the printable page width. Especially dense tables may remain easier to read when Landscape is selected manually in Chrome's print dialog.
- Table display settings last only for the current reader session and are not persisted across conversations.
- Custom titles persist only when both stable source conversation and assistant-message identities are available. Otherwise the rename remains intentionally session-only so it cannot be applied to the wrong response later.
- ReadBooster 0.5.0 does not provide search, bookmarks, annotations, response or prompt editing, AI revisions, code execution, selective print/export, Claude or other additional extraction, persistent conversation bodies, or automatic conversation polling. Search remains a future feature; no placeholder or inactive search control is included.
- Copy uses the browser clipboard API with a local fallback and may be restricted by unusual browser or enterprise policies.
- Printing uses Chrome's browser print dialog; final pagination varies with printer settings.

## Roadmap

The next integration task is live Gemini acceptance followed by small, sanitized fixture corrections for any authenticated DOM differences. Claude extraction should remain separate until its current structure can be inspected and tested independently.

Later roadmap candidates include search, bookmarks, annotations, response editing, AI-assisted revisions, selective print/export, safe completion-triggered refresh, and separately verified platform adapters. These features are not implemented in 0.5.0.
