# Print Studio — 0.7.3 manual acceptance

Version 0.7.3 remains unreleased. Run this matrix with unpacked Chrome and temporary Firefox builds. Do not treat a browser preview or automated harness as store acceptance.

## Reader regression

For ChatGPT, Gemini, Mistral, and Claude where authenticated access is available:

1. Open ReadBooster and verify Document and Focus modes.
2. Check highlights, Stickers, renamed sections, tables, code, document blocks, and images.
3. Confirm the existing Copy, quick Print, Refresh, and responsive Optimize Reading controls still work.

## Print Studio workflow

1. Open **Actions**, then **Print Studio**.
2. Confirm the preview uses the conversation title and all assistant sections by default.
3. Toggle user prompts, assistant responses, Stickers, highlight styling, and images independently.
4. Include and exclude individual sections.
5. Move sections up and down and verify the Reader order remains unchanged after closing Print Studio.
6. Add a page break before a non-first section.
7. Test A4 and Letter, portrait and landscape, every margin preset, font-size preset, line-spacing preset, and content-width preset.
8. Confirm tables remain within the printable width, code wraps readably, and images retain their aspect ratio.
9. Confirm included Stickers appear with their related section and hidden Stickers remain stored in the Reader.
10. Confirm highlights retain their style when enabled and render as ordinary unchanged text when disabled.
11. Select **Print**, verify the browser dialog opens, and inspect Print Preview and Save as PDF output.
12. Confirm settings controls, buttons, Reader chrome, Sticker controls, and highlight controls do not print.
13. Return to the Reader and verify its mode, scroll position, titles, highlights, and Stickers are unchanged.

## Accessibility and constrained layouts

1. Open and close Print Studio using only the keyboard.
2. Verify visible focus, logical tab order, checkbox and select labels, and Escape returning to the Reader.
3. Test light and dark Reader appearances.
4. Test browser zoom at 100%, 150%, and 200%.
5. Test a narrow desktop window and mobile-sized viewport; settings and preview must remain usable without horizontal page overflow.

Record Chrome and Firefox results separately. Do not claim Save as PDF or authenticated platform acceptance unless it was completed in the real browser.
