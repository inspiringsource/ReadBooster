# Firefox listing draft

This is submission copy only. ReadBooster is not yet claimed as submitted, signed, reviewed, or published on AMO.

## Name

ReadBooster

## Summary

Turn long AI conversations and GitHub Discussions into structured, readable documents.

## Support email

contact@avicloud.ch

## Website

https://inspiringsource.github.io/ReadBooster/

## Privacy policy

https://inspiringsource.github.io/ReadBooster/privacy/

Confirm that the privacy route is live before submitting this listing.

## Description

ReadBooster turns supported AI conversations and individual GitHub Discussions into calm, structured reading documents directly in the browser.

- Continuous Document Mode presents discovered assistant responses chronologically.
- Focus mode keeps one response at a time with Previous and Next navigation.
- A grouped conversation outline supports section and heading navigation.
- Table controls provide Fit, Wide, Fullscreen, Compact text, and Reset modes.
- Reading styles include Default, Serif, Dyslexia-friendly, and optional Fast Reading.
- Guided Reading provides local scroll and keyboard-based passage focus in Document and Focus views without hiding surrounding content.
- ChatGPT, Google Gemini, Mistral, and Claude are supported in the 0.7.5 candidate. Individual repository and organisation GitHub Discussions are experimental in 0.7.5 and still require live Firefox acceptance. Claude has been tested successfully in a real authenticated conversation; the normal Firefox-specific release regression remains part of submission testing.
- Reader preferences, user-created section titles, private section Stickers, and text highlights are stored locally.
- Stickers support short notes, pinning, collapsing, and section-relative placement without appearing in Copy or Print output.
- Highlights store the selected passage and short anchoring context locally so they can be restored; highlight data is not transmitted to ReadBooster.
- Complete source documents are processed locally and are not persisted by ReadBooster.
- ReadBooster has no backend, analytics, advertising, or account system.
- Feedback is user initiated and opens an external Tally form inside a ReadBooster modal.

## Reviewer notes

Supported source content is processed locally and is not transmitted to ReadBooster. All extension application code, Highlight.js code, and fonts are packaged locally; no remote executable code or external font request is used. The Tally form loads only after explicit user activation, attaches no source content automatically, and is external page content rather than extension code. A source package and reproducible build instructions are supplied. ReadBooster project source is MPL-2.0; Fast Sans is bundled from Fast Font under the MIT License with complete attribution in `THIRD_PARTY_NOTICES.md`.
