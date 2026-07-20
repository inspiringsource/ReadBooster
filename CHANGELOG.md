# Changelog

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
