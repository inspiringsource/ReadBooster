# Contributing to ReadBooster

Thanks for considering a contribution to ReadBooster.

Contributions can be as small as correcting documentation or describing a conversation that does
not render properly. Code changes, tests, accessibility improvements, and new platform adapters are
also welcome. You do not need to understand the whole project before helping.

## Values

Changes should protect reading quality, accessibility, local-first privacy, narrow browser
permissions, and faithful treatment of source conversations. Prefer focused changes with evidence
over speculative platform-wide rewrites.

The goal is not to support the largest number of sites or add features for their own sake.
ReadBooster should make long, structured conversations and discussions easier to read, navigate,
annotate, and reuse.

## Workflow

Before starting a larger feature or platform adapter, open an issue so we can compare ideas and avoid
duplicated work. This is especially important for storage migrations, permissions, new dependencies,
or new providers. Create a focused branch, keep unrelated changes out of the patch, and submit a
pull request against the protected default branch.

Install with Node.js 22 or newer and npm:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build:chrome
npm run build:firefox
npm run verify:chrome
npm run verify:firefox
npm run lint:firefox
```

Use TypeScript types instead of disabling checks. Follow the existing React, CSS, testing, and
formatting conventions. `npx prettier --check .` and `git diff --check` must pass.

## Platform changes

Read `docs/adding-a-platform.md` first. Adapter changes must keep provider DOM selectors out of the
shared renderer and include representative sanitized fixtures, extraction and duplicate-prevention
tests, streaming and SPA-navigation coverage where applicable, and a documented live manual test.
Never commit private conversations or discussions, cookies, tokens, or account data.

## Security, privacy, and accessibility

Do not add remote executable code, telemetry, broad host access, unsafe HTML insertion, private API
access, conversation logging, or new data transmission without explicit maintainer review. Every UI
change must remain keyboard-usable, expose accessible names and focus states, preserve reduced-motion
preferences, and work in supported light/dark and responsive layouts.

Contributions are reviewed carefully because browser extensions operate on potentially sensitive
conversation content. This protects users; it is not intended to discourage small or early ideas.

Report vulnerabilities through `SECURITY.md`, not a public issue.

## Documentation and review checklist

- [ ] The behavior and scope are described clearly.
- [ ] Tests cover normal, empty, malformed, and regression cases.
- [ ] Both browser builds and verifiers pass.
- [ ] Manual browser checks are listed honestly.
- [ ] Permissions and privacy documentation remain accurate.
- [ ] New dependencies have a purpose, licence, and security review.
- [ ] Changelog and user documentation mention only completed behavior.
- [ ] No generated build or release archive is committed.

## Licence

By submitting a contribution, you agree that your contribution is provided under the Mozilla Public
License 2.0. No separate contributor licence agreement is required at this stage.

The central `LICENSE` and `NOTICE.md` files establish the current project licence. New standalone
project-owned source files should use the MPL 2.0 Exhibit A notice when practical. Existing source
headers will be reviewed consistently before public release rather than changed mechanically in a
large, noisy patch. Do not add the notice to generated files, JSON, lockfiles, fixtures, snapshots,
or third-party material.
