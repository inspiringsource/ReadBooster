# ReadBooster privacy policy — draft

> **Draft for a separate website update. This policy is not yet claimed to be published.**

**Effective date:** `[EFFECTIVE DATE TO BE PROVIDED]`

**Contact/support:** `contact@avicloud.ch`

No incorporated-company status, legal address, or data-protection officer is asserted by this draft. Legal identity details must receive final review before publication.

## 1. Product and scope

ReadBooster is a browser extension for Chrome and Firefox that improves the readability, navigation, and organization of AI conversations by rendering them locally as structured reading documents. Version 0.7.1 supports:

- ChatGPT at `https://chatgpt.com/*`;
- Google Gemini at `https://gemini.google.com/*`;
- Mistral at `https://chat.mistral.ai/*`.
- Claude at `https://claude.ai/*`.

ReadBooster does not request access to unrelated Mistral marketing, documentation, account, or API pages or to Claude subdomains. Claude live authenticated acceptance remains pending for this unreleased build.

## 2. Website and conversation content

When a user activates ReadBooster on a supported website, the extension reads the currently available conversation content from that page and processes it locally in the browser to provide Document and Focus reading modes, navigation, outlines, tables, code controls, Copy, Print, and related reader features.

Conversation content can include prompts, AI responses, headings, links, citations, tables, code, and response images. ReadBooster does not upload complete prompt or response bodies to a ReadBooster server and does not persist complete conversations. ReadBooster has no backend.

Where supported response markup already references an image, the browser may load that image from its existing source reference so that it can appear in the reader. ReadBooster does not proxy, upload, or persist those image URLs. Image availability and the source provider’s handling of the request can be governed by that provider’s policies.

## 3. Information stored locally

ReadBooster uses browser-managed local extension storage for:

- validated reader preferences, such as appearance, text size, spacing, code appearance, and initial document position;
- user-created custom section-title overrides;
- user-created Sticker notes, their collapsed/pinned state, and section-relative position;
- minimal stable local association keys needed to match a custom title or Sticker to the correct supported conversation response where suitable identifiers are available.

ReadBooster does not use storage to retain complete prompts, assistant responses, response HTML, tables, charts, code blocks, signed media URLs, or complete conversation documents.

## 4. Accounts, analytics, advertising, and sale of data

ReadBooster has:

- no ReadBooster account system;
- no analytics or telemetry;
- no advertising;
- no payment system;
- no sale of personal data;
- no ReadBooster backend.

ReadBooster does not use OpenAI, Gemini, Anthropic, or Mistral APIs, private AI-platform endpoints, or network interception. It does not execute code contained in AI responses and does not load remote executable extension code.

## 5. Optional feedback through Tally

The optional **Feedback** action loads the external Tally form at `https://tally.so/r/QKWqjp` only after the user explicitly activates it. The form is displayed as external web content in an iframe. ReadBooster does not load Tally’s widget script into the extension execution context and does not inspect submitted iframe content.

ReadBooster does not automatically attach prompts, assistant responses, conversation titles, source URLs, conversation identifiers, selected text, screenshots, account details, or other conversation content. Tally receives only information the user deliberately enters or uploads. Users should avoid including private conversation information in feedback text, screenshots, or attachments unless they intentionally choose to disclose it.

Tally is an external service and its own terms and privacy practices apply to information submitted through its form.

## 6. Data deletion

Users can remove ReadBooster’s locally stored preferences, custom section titles, and Stickers by:

1. uninstalling ReadBooster, subject to the browser’s extension-storage behavior; or
2. opening the browser’s extension/data management tools and clearing ReadBooster’s extension storage.

Browser interface wording can change between releases. Chrome users may open `chrome://extensions`; Firefox users may open `about:addons`. Locate ReadBooster and use the available extension-data or removal controls. Because ReadBooster does not maintain a backend or user account, there is no separate ReadBooster server-side conversation archive to delete.

Uninstalling the extension removes the installed extension. The browser controls the final deletion and synchronization behavior of browser-managed local extension data.

## 7. Security approach

ReadBooster minimizes access and data handling by:

- requesting only the `storage` extension permission;
- limiting host access to ChatGPT, Google Gemini, the Mistral chat application, and Claude;
- processing conversation content locally;
- using a conservative HTML sanitizer before rendering extracted content;
- stripping host controls, scripts, event handlers, and unsafe markup;
- bundling application code and syntax highlighting locally;
- avoiding analytics, remote executable code, private platform APIs, and persistent conversation-body storage.

No software can guarantee absolute security. Users should keep Chrome and the extension updated and avoid deliberately entering sensitive information into external feedback forms.

## 8. Chrome Web Store Limited Use

ReadBooster’s use and handling of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. User data is used only to provide ReadBooster’s user-facing reading and document-organization features. It is not sold, used for advertising, or used for credit or lending purposes.

This statement does not claim that ReadBooster uses a Google API.

## 9. Changes to this policy

This policy may be updated when ReadBooster’s functionality, supported platforms, legal requirements, or external services change. A published policy should show its effective date and describe material changes where appropriate.

## 10. Contact and publication placeholders

Before publication, replace these placeholders:

- `[EFFECTIVE DATE TO BE PROVIDED]`

Possible future website routes may include:

- `https://inspiringsource.github.io/ReadBooster/privacy/`
- `https://inspiringsource.github.io/ReadBooster/support/`

These routes are suggestions only. This draft does not claim that either route currently exists.
