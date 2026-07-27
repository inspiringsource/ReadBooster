# ReadBooster 0.7.0 repository audit

Status: preparation audit; manual review is still required before public visibility.

## Checked

- tracked and untracked filenames, including environment-file patterns;
- current-tree text for private keys, common service tokens, secret assignments, local absolute
  paths, telephone numbers, and credentials;
- Git-history filenames and text for the same high-risk patterns;
- release and build output policy;
- direct dependency licences and aggregate transitive licence metadata;
- dependency install scripts and package audit output;
- manifest hosts, permissions, remote code patterns, and privacy claims.

No `.env` file, private key, common GitHub/AWS token, signing credential, telephone number, or local
`/Users/...` path was found in the project-owned current tree. The public project/security address
`contact@avicloud.ch` is intentional. No private conversation fixture or authentication data was
identified in the reviewed source fixtures.

## Removed or corrected

- The historical root-level `readbooster-0.5.2-chrome.zip` is removed from the current tree because
  release archives are reproducible and should not be tracked.
- The all-rights-reserved source-review notice is replaced by the official MPL 2.0 licence.
- Generated outputs, archives, caches, profiles, logs, and environment files remain ignored.

## Retained

- `THIRD_PARTY_NOTICES.md` retains the Fast Font MIT licence and attribution.
- Sanitized fixtures remain because they are required for reproducible adapter tests.
- `package-lock.json` remains the exact dependency graph for review and reproduction.

## Dependency observations

Runtime dependencies declare MIT, BSD-3-Clause, or an MPL-2.0/Apache-2.0 choice. All resolved
packages expose licence metadata in the current lockfile, but this is not a legal certification.
Alternative-licence metadata for packages such as `node-forge` and `jszip` should be included in the
final legal review. The lockfile marks optional macOS file-watcher dependency `fsevents@2.3.3` as a
native install-script package; its installed metadata declares MIT and does not define a custom
network install command. No application runtime dependency uses an install script.

`npm audit --omit=dev --audit-level=high` reports zero vulnerabilities. The complete development
tree reports 13 high-severity findings in tooling dependencies, including `web-ext` transitive ZIP,
glob, URI, and shell parsing packages. npm's proposed forced resolution would replace `web-ext` with
an incompatible `0.0.1` version, so no breaking automatic audit fix was applied. These findings must
be reviewed again before public release and when upstream tooling publishes compatible fixes.

## Manual action before publication

1. Review copyright ownership, contributor ownership, dependency notices, and MPL file-header policy
   with appropriate legal advice.
2. Review sanitized screenshots and binary assets manually for personal information.
3. Run a dedicated secret scanner against the complete Git history and rotate any credential if a
   historical secret is discovered. Removing a current file does not remove its history.
4. Confirm public repository links, issue contact expectations, store ownership, and release-signing
   procedure.
5. Re-run `npm audit`, the full build/release workflow, and archive inspection from a clean checkout.

The pattern-based Git-history audit found no targeted secret matches, but pattern scans cannot prove
that history contains no sensitive information.
