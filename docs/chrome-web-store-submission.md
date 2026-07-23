# Chrome Web Store submission notes

This document contains reusable draft text for a future ReadBooster Chrome Web Store submission. It does not mean that the extension has been submitted, reviewed, approved, or published.

## Release details

- Extension: ReadBooster
- Submission candidate: 0.6.9
- Manifest: Version 3
- Currently supported websites: ChatGPT, Google Gemini, and Mistral
- Requested Chrome permission: `storage`
- Requested host access: `https://chatgpt.com/*`, `https://gemini.google.com/*`, and `https://chat.mistral.ai/*`
- Public homepage: <https://inspiringsource.github.io/ReadBooster/>

Mistral's production role boundaries, Canvas extraction, and rich-table normalization are improved in 0.6.2, while full Chrome and Firefox acceptance remains pending. Claude is planned for a future development milestone, is not enabled, and receives no host access.

## Single-purpose statement

> ReadBooster improves the readability, navigation, and organization of AI conversations on supported websites by rendering them locally as structured reading documents.

## Permission justifications

### Storage

> The storage permission is used to save reader preferences, user-created custom section titles, and user-created section Stickers locally in Chrome. ReadBooster does not use this permission to store complete prompt or response bodies.

### ChatGPT host access

> Access to https://chatgpt.com/* is required to detect and locally extract the AI conversation selected by the user, inject the Optimize Reading control, and render the conversation in ReadBooster’s reader interface. Conversation content is not sent to ReadBooster servers.

### Google Gemini host access

> Access to https://gemini.google.com/* is required to detect and locally extract the AI conversation selected by the user, inject the Optimize Reading control, and render the conversation in ReadBooster’s reader interface. Conversation content is not sent to ReadBooster servers.

### Mistral host access

> Access to https://chat.mistral.ai/* is required to detect and locally extract the AI conversation selected by the user, inject the Optimize Reading control, and render the conversation in ReadBooster’s reader interface. Conversation content is not sent to ReadBooster servers.

No Claude, broad `mistral.ai`, `<all_urls>`, `activeTab`, `tabs`, `scripting`, `webRequest`, or other permission is requested.

## Remote-code declaration

> No, ReadBooster does not use remote executable code.

All ReadBooster application code and the selected Highlight.js language modules are bundled locally with the extension. The optional, user-initiated Feedback action displays an external Tally webpage in an iframe. That webpage is external content, not extension code. ReadBooster does not load Tally’s widget script into the extension execution context, call `Tally.openPopup()`, inspect submitted iframe content, or execute downloaded application code.

## Data disclosures

Recommended Chrome Web Store disclosure categories:

- **Website content:** ReadBooster reads the supported conversation page DOM locally to produce its reader interface.
- **Personal communications:** prompts and AI responses can contain personal communications and are locally processed to provide the user-requested reading experience.

Chrome Web Store disclosures treat locally processed data as handled data even when it is not transmitted to ReadBooster. ReadBooster does not upload complete prompts or responses to ReadBooster servers and does not persist complete conversation bodies.

ReadBooster does not collect or use:

- financial information;
- health information;
- authentication information;
- location;
- browsing history;
- user-activity analytics.

ReadBooster has no account system, analytics, advertising, payment system, or backend. It does not use OpenAI, Gemini, Claude, or Mistral APIs or private AI-platform endpoints. It does not execute code contained in AI responses.

Reader preferences, user-created custom section titles, and user-created Sticker notes are stored locally in Chrome. Titles and Stickers use minimal stable local association keys where the supported platform exposes suitable identifiers. Complete prompts, responses, tables, charts, code, signed image URLs, and other conversation bodies are not written to storage.

The optional Feedback action loads `https://tally.so/r/QKWqjp` only after direct user activation. ReadBooster does not automatically attach conversation content, identifiers, titles, source URLs, selected text, screenshots, or account data. Tally receives only information the user deliberately enters or uploads in its form.

## Limited Use statement

> ReadBooster’s use and handling of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. User data is used only to provide ReadBooster’s user-facing reading and document-organization features. It is not sold, used for advertising, or used for credit or lending purposes.

ReadBooster does not claim to use a Google API. Gemini content is read from the current page DOM after the user opens a supported conversation.

## Reviewer test instructions

> ReadBooster works on ChatGPT, Google Gemini, and Mistral.
>
> No ReadBooster account or credentials are required. Reviewers may use their own test account for the supported third-party platform.
>
> 1. Install ReadBooster.
> 2. Open https://chatgpt.com/, https://gemini.google.com/, or a Mistral conversation at `https://chat.mistral.ai/work/{conversation-id}`.
> 3. Sign in using a reviewer-controlled account if required.
> 4. Open or create a conversation containing at least one AI response.
> 5. Refresh the page once after installing the extension.
> 6. Click the ReadBooster “Optimize Reading” control, or open the extension popup and select “Optimize latest response.”
> 7. Confirm the conversation opens in Continuous Document Mode.
> 8. Test Document and Focus modes, outline navigation, reading settings, Copy, Print, tables, code blocks, custom section titles, and local section Stickers.
> 9. The optional Feedback action opens a Tally form only after explicit activation. No conversation content is attached automatically.
>
> ReadBooster processes conversation content locally. It has no backend, ReadBooster login, analytics, payment, or advertising system.

## Distribution recommendation

> Initial beta visibility: Unlisted  
> Geographic distribution: All regions  
> Publishing: Deferred/manual publication after review

This is a recommendation for the future dashboard configuration only. Publication remains a deliberate manual action.

## Website handoff checklist

The website is maintained separately and is not changed by the 0.6.9 extension task. A later website update should:

- show current extension version 0.6.9;
- show ChatGPT support;
- show Google Gemini support;
- show Mistral support with an honest live-verification status;
- describe Claude as planned for a future development milestone;
- explain local conversation processing and local preference/custom-title/Sticker storage;
- disclose the optional user-initiated external Tally feedback form;
- publish a reviewed privacy-policy page;
- publish a support/contact page with user-approved contact details;
- add the Chrome Web Store link only after publication.

Possible future routes, not currently claimed as published:

- `https://inspiringsource.github.io/ReadBooster/privacy/`
- `https://inspiringsource.github.io/ReadBooster/support/`
