# Adding a platform adapter

ReadBooster keeps provider DOM knowledge at the edge of the extension:

```text
location detection -> platform adapter -> normalized conversation -> shared reader
```

The shared reader must not know which CSS selectors ChatGPT, Gemini, Mistral, or Claude use.

## Adapter location and contract

Adapters live in `src/content/adapters/` and implement `ConversationAdapter` from
`ConversationAdapter.ts`. The contract supplies a stable provider ID and display name, declares
capabilities, detects eligible pages, extracts a normalized `ConversationDocument`, observes
bounded page changes, and optionally scans virtualized conversations.

Register a new platform once in `src/shared/platforms.ts`. That registry is the shared source for
hostname detection, popup eligibility, and manifest host matches. Keep path eligibility in the
adapter because a supported origin can contain account, login, or settings pages.

Normalized messages are `DocumentContentBlock` values with:

- an original role (`user` or `assistant`);
- sanitized semantic HTML and its text equivalent;
- a stable message ID when the source exposes one;
- source URL, provider, conversation ID, extraction time, and a content fingerprint.

The renderer owns Document and Focus modes, outlines, custom titles, document blocks, code, tables,
reading settings, copying, printing, Stickers, and accessibility. Do not fork those systems inside
an adapter.

## Selector policy

Prefer selectors in this order:

1. semantic attributes describing message role or content;
2. stable test or data attributes;
3. accessible roles and labels when they are not language-dependent;
4. documented structural relationships;
5. narrow presentation-class fallbacks.

Avoid `nth-child`, generated class combinations, deep DOM paths, visible English strings, and
unbounded page-wide selectors. Centralize every provider-specific assumption in its adapter and add
a comment for each non-obvious fallback.

## Extraction and sanitization

Clone source nodes; never mutate the provider page. Remove native buttons, toolbars, menus,
composers, hidden duplicates, feedback controls, and application chrome from the clone. Then pass
the clone through `sanitizeResponseHtml`. Never insert raw provider `innerHTML` into the Reader,
preserve event handlers, or weaken the sanitizer for one provider.

Preserve headings, paragraphs, lists, blockquotes, links, tables, code, math, citations, and
meaningful response media. Platform-native document or artifact containers may be normalized to
the existing `data-readbooster-content-block="document"` marker only after their content is bounded
to a verified assistant message. Code-only artifacts should remain code blocks.

Stable source IDs prevent duplicates. Prefer a source message ID; a deterministic provider-specific
ID may be used when public stable metadata exists. Session-only identities must never masquerade as
persistent identifiers. Re-rendered nodes with the same stable ID should replace older candidates,
not create a second response.

## Streaming, SPA navigation, and scanning

Streaming content may be extracted as the currently visible partial response. Debounce DOM changes
and reuse the shared refresh behavior; do not reopen the reader or reset scroll on every token.
Observers must ignore ReadBooster's own DOM and clean up listeners on teardown.

Listen for relevant route and DOM changes because supported applications are single-page apps. Page
eligibility and conversation identity must be recalculated from the current route. Virtualized
conversation scans must use the bounded `conversationSourceScanner` pipeline, honor abort signals,
and terminate on the shared progress limits.

## Fixtures and tests

Create a small sanitized fixture under `tests/fixtures/`. It should reproduce structure without
private conversations, authentication data, or copyrighted long-form content. Include realistic:

- user and assistant turns in chronological order;
- stable IDs and a duplicate rerender;
- headings, lists, tables, code, links, media, and citations where supported;
- native controls that must be excluded;
- streaming, incomplete, and malformed nodes;
- document/artifact content where applicable;
- unrelated sidebar, composer, or side-panel content.

Tests must cover hostname and route detection, role classification, ordering, stable identity,
duplicate prevention, sanitization, controls exclusion, empty pages, streaming, refresh/scan, and
SPA-change notification. Add a shared-reader integration test proving the normalized output works in
Document and Focus modes. Existing provider regression tests must continue to pass.

## Manual verification checklist

For both Chrome and Firefox:

1. load the generated unpacked directory;
2. open a real saved conversation and confirm a single Optimize Reading control;
3. verify Document and Focus modes, prompts, outlines, renamed titles, refresh, Stickers, tables,
   code, images, math, Copy, and Print;
4. navigate between conversations without a full reload;
5. create and complete a streaming answer;
6. inspect console, CSP, and extension asset errors;
7. record any content type or route not yet verified.

Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build:chrome`,
`npm run build:firefox`, `npm run verify:chrome`, `npm run verify:firefox`, and
`npm run lint:firefox`. Do not claim live compatibility from fixtures alone.

## Pull-request checklist

- [ ] The official host and supported routes are documented.
- [ ] Permissions are restricted to the required origin.
- [ ] Provider selectors exist only in the adapter.
- [ ] Sanitized fixtures contain no private data.
- [ ] Extraction, duplicate, streaming, SPA, and malformed-DOM tests pass.
- [ ] Chrome and Firefox builds and manifests pass verification.
- [ ] Manual verification steps and known limitations are included.
- [ ] Privacy, README, changelog, and store-review documentation are accurate.

This process also applies to possible future adapters such as Perplexity or DeepSeek. Mentioning a
platform here is not a statement of current support.
