# Chrome Web Store submission notes

This document contains reusable draft text for a future ReadBooster Chrome Web Store submission. It does not mean that the extension has been submitted, reviewed, approved, or published.

## Release details

- Extension: ReadBooster
- Submission candidate: 0.7.5 (unreleased candidate)
- Manifest: Version 3
- Currently supported sources: ChatGPT, Google Gemini, Mistral, Claude, and experimental GitHub Discussions
- Requested Chrome permission: `storage`
- Requested host access: `https://chatgpt.com/*`, `https://gemini.google.com/*`, `https://chat.mistral.ai/*`, `https://claude.ai/*`, and `https://github.com/*`
- Public homepage: <https://inspiringsource.github.io/ReadBooster/>

Claude uses a semantic adapter introduced in 0.7.0 with sanitized fixture coverage. A real authenticated Claude conversation was tested successfully after the latest fix. Browser-specific release regression remains required; this document does not claim a complete Chrome and Firefox acceptance matrix.

## Single-purpose statement

> ReadBooster improves the readability, navigation, and organization of supported AI conversations and individual GitHub Discussions by rendering them locally as structured reading documents.

## Permission justifications

### Storage

> The storage permission is used to save reader preferences, user-created custom section titles, section Stickers, and text highlights locally in Chrome. Highlight records include the selected passage and short anchoring context needed to restore it. ReadBooster does not use this permission to store complete prompt or response bodies.

### ChatGPT host access

> Access to https://chatgpt.com/* is required to detect and locally extract the AI conversation selected by the user, inject the Optimize Reading control, and render the conversation in ReadBooster’s reader interface. Conversation content is not sent to ReadBooster servers.

### Google Gemini host access

> Access to https://gemini.google.com/* is required to detect and locally extract the AI conversation selected by the user, inject the Optimize Reading control, and render the conversation in ReadBooster’s reader interface. Conversation content is not sent to ReadBooster servers.

### Mistral host access

> Access to https://chat.mistral.ai/* is required to detect and locally extract the AI conversation selected by the user, inject the Optimize Reading control, and render the conversation in ReadBooster’s reader interface. Conversation content is not sent to ReadBooster servers.

### Claude host access

> Access to https://claude.ai/* is required to detect and locally extract a Claude conversation selected by the user, inject the Optimize Reading control when usable assistant content exists, and render the conversation in ReadBooster's reader interface. Conversation content is not sent to ReadBooster servers.

### GitHub host access

> Access to https://github.com/* is required by browser-extension match patterns so ReadBooster can detect individual GitHub Discussions, add the Optimize Reading control, and locally transform discussion content already visible on the page. Runtime activation is restricted to `/<owner>/<repository>/discussions/<number>` and `/orgs/<organization>/discussions/<number>`. ReadBooster does not activate on Issues, pull requests, repository or organisation pages, settings, profiles, search, or discussion listings; it does not use GitHub APIs, request authentication tokens, or transmit discussion content to ReadBooster servers.

No broad `mistral.ai`, Claude subdomain, `api.github.com`, `<all_urls>`, `activeTab`, `tabs`, `scripting`, `webRequest`, or other permission is requested.

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

ReadBooster has no account system, analytics, advertising, payment system, or backend. It does not use OpenAI, Gemini, Claude, Mistral, GitHub REST, or GitHub GraphQL APIs or private platform endpoints. It does not execute code contained in source content.

Reader preferences, user-created custom section titles, Sticker notes, and text highlights are stored locally in Chrome. Titles, Stickers, and highlights use minimal stable local association keys where the supported platform exposes suitable identifiers. A highlight stores its selected text, style, bounded prefix/suffix context, and offsets; complete prompts, responses, tables, charts, code, signed image URLs, and other conversation bodies are not written to storage.

The optional Feedback action loads `https://tally.so/r/QKWqjp` only after direct user activation. ReadBooster does not automatically attach conversation content, identifiers, titles, source URLs, selected text, screenshots, or account data. Tally receives only information the user deliberately enters or uploads in its form.

## Limited Use statement

> ReadBooster’s use and handling of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. User data is used only to provide ReadBooster’s user-facing reading and document-organization features. It is not sold, used for advertising, or used for credit or lending purposes.

ReadBooster does not claim to use a Google API. Gemini content is read from the current page DOM after the user opens a supported conversation.

## Reviewer test instructions

> ReadBooster works on ChatGPT, Google Gemini, Mistral, Claude, and individual GitHub Discussions. GitHub Discussions support is experimental in 0.7.5 and still requires live browser regression.
>
> No ReadBooster account or credentials are required. Reviewers may use their own test account for the supported third-party platform.
>
> 1. Install ReadBooster.
> 2. Open a supported AI conversation or a public individual GitHub Discussion at `https://github.com/<owner>/<repository>/discussions/<number>` or `https://github.com/orgs/<organization>/discussions/<number>`.
> 3. Sign in using a reviewer-controlled account if required.
> 4. Open or create a conversation containing at least one AI response.
> 5. Refresh the page once after installing the extension.
> 6. Click the ReadBooster “Optimize Reading” control on the page or in the popup.
> 7. Confirm the conversation opens in Continuous Document Mode.
> 8. Test Document and Focus modes, outline navigation, reading settings, Copy, Print, tables, code blocks, custom section titles, local section Stickers, and text highlights.
> 9. The optional Feedback action opens a Tally form only after explicit activation. No conversation content is attached automatically.
>
> ReadBooster processes conversation content locally. It has no backend, ReadBooster login, analytics, payment, or advertising system.

## Distribution recommendation

> Initial beta visibility: Unlisted  
> Geographic distribution: All regions  
> Publishing: Deferred/manual publication after review

This is a recommendation for the future dashboard configuration only. Publication remains a deliberate manual action.

## Website handoff checklist

The website is maintained separately and is not changed by the 0.7.5 extension task. A later website update should:

- show current extension version 0.7.5 only when that release is ready;
- show ChatGPT support;
- show Google Gemini support;
- show Mistral support;
- show Claude as supported, reflecting the successful authenticated conversation test;
- describe GitHub Discussions as experimental without implying general GitHub support;
- explain local conversation processing and local preference/custom-title/Sticker/highlight storage;
- disclose the optional user-initiated external Tally feedback form;
- publish a reviewed privacy-policy page;
- publish a support/contact page with user-approved contact details;
- add the Chrome Web Store link only after publication.

Current public privacy route and support contact:

- `https://inspiringsource.github.io/ReadBooster/privacy/`
- `contact@avicloud.ch`
