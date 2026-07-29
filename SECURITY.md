# Security policy

## Supported versions

ReadBooster 0.7.2 is the current unreleased development candidate. Security fixes are applied to the
current development line on a best-effort basis. This table will be updated when a broader public
support policy is established.

| Version          | Status                     |
| ---------------- | -------------------------- |
| 0.7.x            | Development security fixes |
| Earlier versions | Not actively maintained    |

## Reporting a vulnerability

Email `contact@avicloud.ch` with the subject `ReadBooster security report`. Do not disclose an
unfixed vulnerability in a public issue.

Include the affected version and browser, reproduction steps, expected and observed behavior,
security impact, and any minimal sanitized proof of concept. Remove conversation text, account data,
cookies, tokens, and other personal information. Response and remediation timing are best effort; no
bug bounty or payment is promised.

High-priority areas include conversation-content exposure, excessive host or browser permissions,
content-script injection, sanitizer bypasses, unsafe URLs or HTML, remote executable code, dependency
compromise, malicious adapter behavior, and accidental production logging of conversation content.

ReadBooster does not request authentication credentials or use private provider APIs. A report that
requires sharing account access should instead provide a minimal synthetic reproduction.
