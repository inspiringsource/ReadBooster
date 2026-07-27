# ReadBooster 0.7.1 repository audit

Status: local public-release preparation audit; manual approval is still required before changing
repository visibility.

## Scope and checks performed

- Reviewed tracked filenames and the complete filename history for environment files, private keys,
  credentials, signing material, archives, and screenshot-like files.
- Searched the current tracked text and Git history for common private-key, GitHub, AWS, Google,
  Slack, and secret-token patterns. The encrypted `.pwdnote.enc` payload was deliberately not read or
  printed.
- Checked current text and history for absolute local user paths and reviewed public email addresses.
- Reviewed commit-author metadata, configured remotes, largest historical blobs, current image
  assets, package metadata, browser permissions, community documents, and generated-output policy.
- Re-ran dependency, build, test, manifest, archive, formatting, and Markdown-link checks as recorded
  in the task completion report.

## Current-tree findings

- No private key, common service token, signing credential, `.env` file, credential file, or local
  machine path was identified by the targeted scans. The literal `/Users/...` example in the 0.7.0
  audit is documentation, not a real path.
- `contact@avicloud.ch` is the only tracked email address and is intentionally used for project,
  security, conduct, and Firefox extension identity purposes.
- The configured Git remote is the expected `inspiringsource/ReadBooster` GitHub repository and does
  not embed credentials.
- The tracked PNG assets are ReadBooster branding. The large favicon SVG contains a
  RealFaviconGenerator attribution and an embedded version of the same branding image; no internal
  screenshot or visible personal information was identified in the reviewed assets.
- `.pwdnote.enc` is an intentional 184-byte encrypted PWDNote workspace file. Its contents were not
  inspected or exposed. It is not a build input and remains excluded from browser and source-review
  archives. Publishing the repository will permanently expose the ciphertext, so the maintainer must
  confirm separately that the decryption key has never entered Git history and accepts that risk.

## Git-history findings

- The targeted history scan found no common secret pattern or sensitive configuration filename.
- Commit metadata contains the maintainer's GitHub noreply identity and Dependabot's public bot
  identity. This metadata will be visible when the repository becomes public.
- History contains the deliberately encrypted `.pwdnote.enc` file and a previously removed
  `readbooster-0.5.2-chrome.zip`. Both remain recoverable from Git history. The historical extension
  archive was not flagged as a credential, but it is unnecessary public-history weight and should be
  consciously accepted or removed through a separately approved history-cleaning process.
- No history rewrite or credential rotation was performed.

## Licence and community-file review

- `package.json`, `LICENSE`, `NOTICE.md`, and `CONTRIBUTING.md` consistently identify MPL-2.0.
- `THIRD_PARTY_NOTICES.md` preserves the complete Fast Font MIT notice.
- `CODE_OF_CONDUCT.md` is Contributor Covenant 2.1 and uses `contact@avicloud.ch` for enforcement.
- `SECURITY.md` uses the same private-reporting address and does not promise a bounty or fixed response
  time.
- README and contributor guidance distinguish local preparation from actual public publication.

## Limitations and required manual action

This was a targeted pattern and metadata audit, not a guarantee that no sensitive value exists. A
dedicated history-aware secret scanner such as Gitleaks was not installed in the local environment.
Before publication:

1. Run a dedicated scanner against all refs and review every finding manually.
2. Confirm the PWDNote key and any recovery material have never been committed, backed up publicly,
   or exposed elsewhere.
3. Decide whether to retain the historical extension ZIP and encrypted note in public Git history.
4. Recheck copyright ownership, dependency licences, MPL file-header policy, and store ownership.
5. Review the final public branch, binary assets, archives, and commit metadata one last time.

Removing a secret from the current working tree would not remove it from Git history. If a credential
is found later, rotate it first and plan any history rewrite as a separate, explicitly approved task.
