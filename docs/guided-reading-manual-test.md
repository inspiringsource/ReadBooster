# Guided Reading — 0.7.4 manual acceptance

Version 0.7.4 remains unreleased. Run this matrix with unpacked Chrome and temporary Firefox builds. Record authenticated provider and browser results separately; automated fixtures are not a substitute for live acceptance.

## Setup

Use representative saved conversations on ChatGPT, Gemini, Mistral, and Claude containing long prose, headings, nested lists, a table, a code block, an image with a caption, citations, mathematics, and a provider document or artifact where supported.

For each browser, test at 320, 375, 768, 1024, and 1440 CSS pixels where practical, plus 100%, 150%, and 200% browser zoom. Repeat important checks in light, dark, system, Serif, Dyslexia-friendly, Fast Reading, large-text, and roomy-spacing combinations.

## Core workflow

1. Open **Reading settings** and set **Reading assistance** to **Guided — Soft**.
2. Confirm one meaningful passage is emphasized and all surrounding content remains visible and readable.
3. Scroll normally. The active passage should follow the central reading zone without rapidly alternating at a boundary.
4. Click a passage and confirm it becomes active without blocking text selection or link activation.
5. Use **Previous passage**, **Next passage**, J/K, and Arrow Up/Down. Confirm navigation stops at the first and last passage and places the target in a comfortable reading position.
6. Focus an input, select, section-title editor, Sticker editor, table viewport, and other interactive controls. Confirm Guided shortcuts do not intercept their keyboard behavior.
7. Press Escape after keyboard passage navigation. Confirm temporary passage focus is released without unexpectedly closing the Reader.
8. Compare **Guided — Soft** and **Guided — Focused**, then return to **Standard**. Confirm all Guided metadata and presentation disappear.
9. Close and reopen ReadBooster. Confirm the selected assistance preference returns but the previous active passage is not restored across sessions.

## Document, Focus, refresh, and streaming

1. In Document view, move across passages in several response sections.
2. Switch to Focus view and confirm the active response remains sensible, without duplicate wrappers or content.
3. Switch repeatedly between Document and Focus and enable/disable Guided Reading repeatedly.
4. Refresh the conversation while Guided Reading is enabled. Confirm an unchanged active block is retained where possible and removed content falls back safely.
5. Generate or stream another response. Confirm existing focus does not jump automatically to the new response and new blocks join the order after refresh.
6. Close the Reader and inspect for retained observers, listeners, or orphaned Guided attributes.

## Compatibility

1. Create, recolor, activate, and remove a Highlight inside active and inactive passages.
2. Create, edit, move, collapse, expand, navigate to, and delete a Sticker. Sticker text and controls must remain readable.
3. Exercise Fit, Wide, Compact, Fullscreen, and Reset table modes.
4. Select and copy code, use code Copy, and verify horizontal scrolling.
5. Select ordinary text and use section/document Copy. Copied text must contain no Guided labels or metadata.
6. Open Print Studio. Confirm Guided emphasis and navigation are absent from its preview and output, then return to an unchanged Reader.
7. Use quick Print and inspect print preview. Guided backgrounds, dimming, controls, and metadata must not print.
8. Confirm images retain their aspect ratio and loading an image does not cause persistent active-block oscillation.

## Accessibility and motion

1. Navigate using only the keyboard and verify visible focus on passage controls and user-selected passages.
2. Confirm scroll-driven changes do not create repeated screen-reader announcements; only explicit passage navigation may announce a result.
3. Enable reduced motion and confirm passage navigation uses immediate scrolling and Guided state changes do not animate.
4. Check inactive text remains comfortably readable in light, dark, and system appearance and at high zoom.
5. Where available, test an operating-system high-contrast or forced-colors mode.

## Known limitations for 0.7.4

- Lists, tables, code blocks, figures, mathematics, notices, and provider document blocks are treated as whole reading units rather than line-level units.
- Guided Reading does not save the active passage across Reader sessions.
- It does not provide sentence tracking, cursor illumination, eye tracking, speech, snap scrolling, or two-column reading.

Do not mark this matrix complete unless the checks were performed in the named real browser and provider session.
