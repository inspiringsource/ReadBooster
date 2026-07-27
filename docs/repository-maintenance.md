# Repository maintenance recommendations

This document prepares ReadBooster for public collaboration. It does not change GitHub settings or
grant release access.

## Default branch and review

- Protect the default branch and require pull requests.
- Require the read-only CI workflow in `.github/workflows/ci.yml`, including type checking, linting,
  tests, and Chrome and Firefox build verification. Keep Mozilla lint as a maintainer release check
  unless it is added to CI deliberately.
- Require at least one maintainer approval and dismiss approval after material changes.
- Restrict force pushes and branch deletion.
- `.github/CODEOWNERS` assigns the default review owner to `@inspiringsource`. Add narrower ownership
  rules only when the maintainer structure grows and the distinction improves review quality.

Branch protection secures the official repository. A public open-source repository can be forked;
forking is expected and must not be confused with write access to the official project.

## Releases and secrets

- Restrict store publishing, tags, and release creation to maintainers.
- Protect version tags and use signed tags or attestations when a signing process is established.
- Keep Chrome Web Store, AMO, signing, and email credentials outside the repository.
- Review release ZIP roots, checksums, manifests, permissions, licences, and source-review contents.
- Build from a clean checkout with `npm ci`; never treat an unreviewed local build as the release.

## Dependencies and contributions

- Enable dependency review and vulnerability alerts without automatic breaking upgrades. The
  checked-in Dependabot configuration groups npm updates into one conservative weekly update.
- Review purpose, maintenance, licence, install scripts, and runtime impact before adding dependencies.
- Give outside contributors only the repository permission they need.
- Close malicious or low-quality submissions without running untrusted scripts locally.
- Require sanitized fixtures; never request private conversations in public issues.

## Generated files policy

`dist/`, `dist-chrome/`, `dist-firefox/`, `release/`, coverage, caches, browser profiles, and packaged
archives are reproducible outputs and remain ignored. Source, build scripts, fixtures, documentation,
licence notices, and lockfiles are reviewed and committed. Mozilla reviewers receive the generated
Firefox archive plus the deterministic source-review archive and `docs/release-builds.md`.

Screenshots belong in source control only when they are necessary, sanitized, and documented. Do not
commit local browser profiles, temporary logs, or store credentials.

## MPL file-header policy

The central `LICENSE` and `NOTICE.md` apply to project-owned Source Code Forms. New standalone source
files should use the MPL 2.0 Exhibit A notice when practical. Before public release, conduct one
deliberate file-ownership review and add notices consistently to material files where it improves
clarity. Do not mechanically modify generated files, JSON, binary assets, fixtures, lockfiles, or
third-party material.
