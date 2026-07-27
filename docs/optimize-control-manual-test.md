# Optimize Reading responsive control — 0.7.1 manual matrix

Status: candidate checklist. Completing static or fixture tests does not mark these live checks as
passed.

For each supported platform, open a saved conversation with at least one usable assistant response,
reload after installing the extension, and confirm exactly one injected control:

| Platform      | Required layouts                                                                   |
| ------------- | ---------------------------------------------------------------------------------- |
| ChatGPT       | Standard composer; sidebar open and closed; native voice/composer controls visible |
| Google Gemini | Standard prompt composer; navigation open and closed; narrow content column        |
| Mistral       | `/work/{id}` conversation; standard composer; sidebar changes                      |
| Claude        | `/new`; `/chat/{id}`; sidebar open and closed; artifact panel closed and open      |

Test each platform around 1440, 1280, 1024, 900, and 768 CSS pixels plus a narrower split-screen
layout. Repeat representative widths at 100%, 125%, and 150% browser zoom. The mode may change at
different viewport widths because it is determined by the measured composer-side gap, not a fixed
viewport breakpoint.

Expected behavior:

- Full mode shows the local ReadBooster icon and `Optimize Reading` when the measured outer gap fits.
- Compact mode shows only the same icon when the full control would crowd the composer.
- If neither form fits safely beside the composer, the compact control moves immediately above the
  composer and remains inside the viewport.
- Opening or closing sidebars, artifact panels, and split-screen layouts updates the mode without a
  reload or flicker.
- The control never covers the input, Send, microphone, attachment, voice, model, or other composer
  controls and never creates horizontal scrolling.
- The compact control exposes an `Optimize Reading` tooltip and accessible name, retains a visible
  focus ring, and activates with mouse, Enter, and Space.
- Loading, disabled, successful, and error behavior remain intact while the mode changes.
- SPA navigation and repeated resizes never create a second control.

Record browser/version, platform route, viewport, zoom, sidebar/panel state, observed mode, and any
native control collision. Remove private conversation information from screenshots or reports.
