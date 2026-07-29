# Text highlights — 0.7.2 manual acceptance

Version 0.7.2 remains unreleased. Run this matrix with unpacked Chrome and temporary Firefox builds
before store submission. Record each browser/platform result separately; do not treat fixture or
headless-harness coverage as authenticated provider acceptance.

## Core flow

For ChatGPT, Google Gemini, Mistral, and Claude:

1. Open a saved conversation and launch ReadBooster.
2. Select meaningful text in a paragraph and create each of the four highlight styles.
3. Confirm the toolbar stays in the viewport at narrow width and 100%, 125%, and 150% zoom.
4. Switch repeatedly between Document and Focus views; confirm no duplicate or nested marks appear.
5. Open Highlights, navigate with Previous and Next, and activate an overview entry with the keyboard.
6. Activate a highlighted passage, change its style, and remove it.
7. Close and reopen ReadBooster, reload the provider tab, and restart the browser; confirm remaining
   highlights return only in the same conversation.
8. Refresh the conversation and confirm unchanged passages restore. If content changed ambiguously,
   confirm ReadBooster leaves the record unresolved instead of marking unrelated text.
9. Copy the response and confirm the original text is copied without colour names or highlight IDs.
10. Check print preview: highlight controls are hidden and passages remain readable when background
    printing is disabled.

## Content and accessibility

- Test paragraphs, headings, list items, blockquotes, links/emphasis, document blocks, and table cells.
- Confirm code, mathematics, generated charts, and cross-paragraph selections do not create broken
  highlights.
- Test Light, Dark, and System appearance, all reading styles, text sizes, and spacing settings.
- Test mouse selection and keyboard selection; Escape must close the contextual toolbar.
- Confirm highlighted passages, style actions, overview entries, and navigation controls expose clear
  screen-reader names and visible focus.
- Confirm reduced-motion mode avoids a pulsing navigation animation.

## Regression

Check Stickers, custom section titles, the responsive Optimize Reading control, outlines, tables,
code, document blocks, Copy, Print, conversation refresh, and the unchanged platform extraction
flows. No new permission, host, network request, analytics, account, or backend behavior is expected.
