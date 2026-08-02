# GitHub Discussions — 0.7.5 manual acceptance

Version 0.7.5 remains unreleased. Use public test discussions without private or confidential content. Record browser, extension build, GitHub sign-in state, URL pattern, viewport, zoom, and result. Automated synthetic fixtures do not replace live acceptance.

## Route and control checks

Test both a public repository Discussion and a public organisation Discussion while logged out and while logged in where practical.

1. Open `https://github.com/<owner>/<repository>/discussions/<number>` and confirm one responsive **Optimize Reading** control appears near the discussion header without covering GitHub controls.
2. Open `https://github.com/orgs/<organization>/discussions/<number>` and repeat the same check. Include `https://github.com/orgs/community/discussions/203678` in the public regression while it remains available.
3. Navigate between repository and organisation Discussions through GitHub client-side navigation. Confirm the control remains single and the Reader opens the new discussion, never the previous identity.
4. Use browser Back and Forward.
5. Navigate to a repository home, organisation Discussion list, repository Discussion list/category, Issue, pull request, code file, profile, search, and settings page. Confirm the control disappears and an open Reader closes.
6. Return to a supported discussion and confirm the control can be injected once without leaked observers or duplicate roots.

## Extraction and source fidelity

Choose discussions with an opening post, several authors, top-level comments, nested replies, an edited comment, an accepted answer, headings, lists, task lists, quotations, links, mentions, a table, code, and an image where public examples exist.

- Confirm title, repository or organisation, category, number, visible status, opening post, comments, and replies are in page order.
- Confirm authors, timestamps, edited markers, reply context, permalinks, and accepted-answer labels are accurate when visibly available.
- Confirm reactions, menus, edit/reply controls, hidden duplicates, and host toolbars are absent.
- Confirm code language/copy/scrolling, table Fit/Wide/Compact/Fullscreen, links, images, task-list text, and details content remain usable.
- When GitHub offers Load more or collapsed replies, confirm ReadBooster does not activate it automatically and describes the currently loaded-content boundary.
- Confirm **Open original discussion** and comment source links return to the correct GitHub location.

## Shared Reader features

- Test Document and Focus views, source ordering, custom titles, copy, quick print, and refresh.
- Enable Guided Reading in Soft and Focused styles; verify body passages, code, tables, quotations, and images participate while author metadata does not become the primary passage.
- Create, recolour, navigate, remove, close, and restore Highlights. Edit the public test comment if you control it and confirm ambiguous anchors do not move to unrelated text.
- Create, edit, move, navigate, delete, close, and restore Stickers on the post, a comment, and a reply. Confirm records stay separated between repository Discussions, organisation Discussions, and discussion numbers.
- Open Print Studio; include/exclude entries, Stickers, highlight styling, and images; reorder print-only sections; add a page break; test A4/Letter and portrait/landscape; inspect browser Print/Save as PDF.
- Confirm printed output retains discussion title, repository, URL, authorship, reply context, and accepted-answer text but omits ReadBooster controls, GitHub controls, reactions, and Guided styling.

## Browser, viewport, and performance matrix

Run in unpacked Chrome and temporary Firefox where available at 320, 375, 768, 1024, and 1440 CSS pixels, plus 150% and 200% browser zoom. Check GitHub light and dark appearances.

Use representative discussions with about 10, 50, and 100 or more currently rendered entries where safely available. Reopen and close Reader repeatedly. Confirm bounded scans, responsive control stability, reasonable opening time, correct highlight restoration, and observer/listener cleanup.

## Privacy and network review

- Confirm the manifest adds only `https://github.com/*`, with no `api.github.com`, `<all_urls>`, or new general permission.
- Confirm no GitHub REST/GraphQL calls, tokens, remote parsing, analytics, tracking, or automatic hidden-content requests are introduced.
- Confirm local annotations never post back to GitHub.

## Known limitations for 0.7.5

- GitHub Discussions DOM is not a public extraction API and requires live regression as GitHub changes its rendered markup.
- ReadBooster includes only discussion content currently rendered on the page; it does not expand, paginate, retrieve, or reveal hidden content.
- Reactions are intentionally omitted.
- GitHub Issues, pull requests, repository pages, documentation, and generic web content are unsupported.
- Complete logged-in/logged-out Chrome and Firefox acceptance is manual and must not be claimed from automated fixtures alone.
