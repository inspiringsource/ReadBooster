# Changelog

## [0.7.3] - Unreleased

### Added

- Added Print Studio as a separate workspace for preparing conversations before printing or saving through the browser’s PDF destination.
- Added local controls for prompts, responses, individual sections, Stickers, highlight styling, and images.
- Added A4 and Letter page sizes, portrait and landscape orientation, margin, font-size, line-spacing, and content-width presets.
- Added local section ordering and optional page breaks without changing the source conversation or Reader state.

### Improved

- Added print-preview handling for semantic tables, code, document blocks, images, highlights, and section-related Stickers.
- Kept Print Studio keyboard accessible, responsive on constrained layouts, and compatible with light and dark Reader appearances.
- Removed the small text-decoration artefact beneath the README store badges while preserving their official artwork and links.

### Preserved

- Existing quick printing, Reader modes, highlights, Stickers, custom titles, platform adapters, permissions, and local-only processing.

## [0.7.2] - Unreleased

### Added

- Persistent text highlighting in Document and Focus views.
- Four accessible, theme-aware highlight styles.
- A lightweight highlight overview with previous/next navigation.
- Local highlight persistence with layered, context-aware passage anchoring.

### Improved

- Friendlier README, contributor guidance, and issue-template wording.
- Print-safe and copy-safe handling of highlights.
- Privacy documentation for locally stored highlighted text and anchoring context.

### Preserved

- Local-only processing with no ReadBooster account or backend.
- Existing Stickers, custom titles, platform adapters, responsive controls, and reading features.

## [0.7.1] - Unreleased

### Improved

- Made the shared injected Optimize Reading control responsive across supported AI platforms.
- Added an icon-only compact mode for narrow layouts and crowded chat composers.
- Added measured composer-boundary positioning so ReadBooster avoids obstructing native controls.
- Added accessible labeling, local icon packaging, hysteresis, and responsive-layout tests.
- Recorded successful testing in a real authenticated Claude conversation after the latest fix while retaining the normal browser-specific regression requirements for release acceptance.

### Fixed

- Prevented the responsive Optimize Reading control from oscillating between full and compact modes near its width threshold.
- Isolated full-button measurement and removed self-observation and layout-width transitions that could rapidly alternate the control.

## [0.7.0] - Unreleased

### Added

- Added Claude conversation support with semantic message extraction, streaming-safe refresh behavior, and bounded document/artifact normalization.
- Licensed project-owned ReadBooster source under MPL 2.0.
- Added platform-adapter, contribution, security, conduct, repository-maintenance, and community-template documentation.

### Improved

- Centralized supported-platform host metadata for adapter routing, popup eligibility, and Chrome/Firefox manifests.
- Formalized the adapter contract and documented normalized extraction, sanitization, fixture, and browser-verification expectations.
- Improved repository, dependency, privacy, permission, and reproducible-build documentation for future public review.

### Preserved

- Preserved ChatGPT, Gemini, and Mistral extraction and the shared Document, Focus, outline, title, Sticker, table, code, document-block, Copy, and Print systems.
- Preserved separate Chrome and Firefox Manifest V3 builds with only the `storage` browser permission.

## 0.6.9

### Added

- Displayed ChatGPT editable writing blocks as dedicated static document blocks with preserved formatting.
- Added a document-level Copy action that excludes surrounding responses and reader controls.

## 0.6.8

### Fixed

- Fixed missing content from ChatGPT editable writing blocks.
- Preserved generated writing-block documents in their original response position while removing ChatGPT editing controls and attributes.

## 0.6.7

### Added

- Added compact upward and downward Sticker navigation indicators for long Reader documents.
- Added directional Sticker counts, nearest-destination scrolling, and a brief destination highlight.
- Scoped navigation to all rendered sections in Document mode and the focused response in Focus mode.
- Kept navigation outside the reading column, keyboard accessible, and respectful of reduced-motion preferences.

## 0.6.6

### Fixed

- Made Stickers persist across Reader close and reopen when a supported conversation has a stable route but its response lacks a source message ID.
- Added a conversation-scoped deterministic response-fingerprint fallback without storing conversation bodies or HTML.
- Flushed queued Sticker writes before closing or remounting the Reader and surfaced local-storage failures visibly.
- Added restoration coverage for ChatGPT, Gemini, and Mistral, including delayed writes, state changes, movement, and deletion.

## 0.6.5

### Fixed

- Moved Sticker action menus into a Reader-level overlay so cards and constrained drawers cannot clip actions.
- Added viewport-aware menu placement that flips upward near the lower edge and remains within horizontal bounds.
- Kept all four Sticker actions readable with consistent row sizing, visible keyboard focus, and Escape focus restoration.
- Restored explicit light and dark foreground colors for portaled Sticker menu actions.

## 0.6.4

### Changed

- Replaced ambiguous circular Sticker pins with compact, accessible saved-note controls.
- Positioned new Sticker pins below section controls without narrowing the reading column.
- Added section-relative vertical dragging for collapsed pins and expanded cards, with keyboard movement and local persistence.
- Added collision-aware margin placement so multiple pins remain separated within their owning section.
- Kept constrained layouts on the existing temporary Sticker drawer.

## 0.6.3

### Added

- Introduced local Stickers for attaching short notes to ReadBooster document sections.
- Added editing, section-relative movement, pinning, collapsing, and protected deletion.
- Restored Stickers for stable ChatGPT, Gemini, and Mistral conversation/response identities.
- Kept Stickers attached when sections are renamed and filtered them to the active response in Focus mode.

### Privacy

- Sticker text is stored only in browser-managed local extension storage and is excluded from Copy and Print output.

## 0.6.2

### Added

- Added read-only extraction for visible Mistral Canvas documents associated with assistant messages.
- Added sanitized conversion of Mistral rich-table HTML and conservative semantic reconstruction for role-based table grids.

### Fixed

- Made stable Mistral user and assistant role/message elements the primary conversation boundaries.
- Preferred final answer parts over reasoning and excluded reasoning from normalized output.
- Preserved the existing `/work/{conversation-id}` and compatible `/chat/{conversation-id}` activation routes.

### Compatibility

- Reused the shared ConversationDocument, sanitizer, reader, table controls, Copy, and Print paths without changing ChatGPT or Gemini extraction.

## 0.6.1

### Fixed

- Added production Mistral conversation routing for `/work/{conversation-id}` while retaining `/chat` compatibility.
- Made the confirmed `data-message-part-type="answer"` and `data-testid="text-message-part"` elements the primary Mistral assistant-response selectors.
- Restored Optimize Reading eligibility for real Mistral answer parts and stable response IDs inherited from their bounded ancestors.
- Kept editable Mistral Canvas surfaces outside conversation extraction.

### Compatibility

- Preserved the existing shared reader, ChatGPT and Gemini adapters, minimal permissions, and Chrome/Firefox build architecture.

## 0.6.0

### Added

- Added fixture-backed ReadBooster support for Mistral's web application at `chat.mistral.ai`.
- Added Mistral conversation detection, chronological prompt/response extraction, and provider-scoped stable identities.
- Added Mistral support through the existing Continuous Document and Focus readers, including headings, lists, tables, code, citations, safe response images, and visible file references.
- Added debounced single-page navigation handling and shared bounded conversation scanning for validated Mistral source scrollers.

### Changed

- Extended the production adapter router, popup detection, and Chrome/Firefox manifests with narrowly scoped Mistral chat access.
- Updated platform status and release documentation while keeping Mistral marked as pending authenticated live verification.

### Compatibility

- Preserved existing ChatGPT and Google Gemini adapters and the shared reader behavior from ReadBooster 0.5.3.

## 0.5.3

- Added an optional Fast Reading font for fixation-guided reading.
- Bundled Fast Sans locally for offline and privacy-respecting use.
- Added persistence and reader-content integration for the new font setting.
- Preserved standard monospace rendering for code and preformatted content.
- Added third-party MIT license attribution for Fast Font.
