import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { GitHubDiscussionsAdapter } from "../src/content/adapters/GitHubDiscussionsAdapter";
import { parseGitHubDiscussionUrl } from "../src/shared/githubDiscussions";
import { assistantBlocks } from "../src/shared/types";

const FIXTURE = readFileSync("tests/fixtures/github-discussion.html", "utf8");
const ORGANIZATION_FIXTURE = readFileSync(
  "tests/fixtures/github-organization-discussion.html",
  "utf8",
);

function fixtureDocument(): Document {
  return new DOMParser().parseFromString(FIXTURE, "text/html");
}

function adapter(
  doc = fixtureDocument(),
  url = "https://github.com/example/reader/discussions/42",
): GitHubDiscussionsAdapter {
  return new GitHubDiscussionsAdapter(doc, "github.com", url);
}

describe("GitHub Discussion routes", () => {
  it("accepts individual repository and organisation discussion routes", () => {
    expect(
      parseGitHubDiscussionUrl("https://github.com/example/reader/discussions/42")?.conversationId,
    ).toBe("repo:example/reader#42");
    expect(
      parseGitHubDiscussionUrl("https://github.com/orgs/community/discussions/203678")
        ?.conversationId,
    ).toBe("org:community#203678");
    expect(
      parseGitHubDiscussionUrl("https://github.com/example/reader/discussions/42/"),
    ).not.toBeNull();
    for (const url of [
      "https://github.com/example/reader/discussions",
      "https://github.com/example/reader/discussions/categories/ideas",
      "https://github.com/example/reader/issues/42",
      "https://github.com/example/reader/pull/42",
      "https://github.com/example/reader/pulls",
      "https://github.com/example/reader",
      "https://github.com/orgs/community/discussions",
      "https://github.com/orgs/community/settings/discussions",
      "https://github.com/search?q=discussions",
      "https://github.example.com/example/reader/discussions/42",
      "http://github.com/example/reader/discussions/42",
    ])
      expect(parseGitHubDiscussionUrl(url)).toBeNull();
  });
});

describe("GitHubDiscussionsAdapter", () => {
  it("fails closed off an individual discussion page", () => {
    expect(adapter().isSupportedPage()).toBe(true);
    expect(
      adapter(fixtureDocument(), "https://github.com/example/reader/issues/42").isSupportedPage(),
    ).toBe(false);
    expect(
      new GitHubDiscussionsAdapter(
        fixtureDocument(),
        "github.example",
        "https://github.com/example/reader/discussions/42",
      ).isSupportedPage(),
    ).toBe(false);
  });

  it("extracts the post, comments and reply in source order with stable identities", () => {
    const conversation = adapter().getConversationDocument()!;
    const responses = assistantBlocks(conversation);
    expect(conversation).toMatchObject({
      source: "github-discussion",
      title: "Designing a bounded discussion reader",
      sourceUrl: "https://github.com/example/reader/discussions/42",
    });
    expect(conversation.sourceContext).toMatchObject({
      label: "GitHub Discussion",
      details: ["example/reader", "Discussion #42", "Ideas", "Answered"],
      actionLabel: "Open original discussion",
    });
    expect(conversation.sourceContext?.notice).toContain("currently loaded");
    expect(responses.map((response) => response.provenance.sourceMessageId)).toEqual([
      "original-post",
      "1001",
      "1002",
      "1003",
      "1004",
    ]);
    expect(responses.map((response) => response.sectionTitle)).toEqual([
      "Original post by @maintainer",
      "Comment by @reviewer",
      "Reply by @helper to @reviewer",
      "Comment by @answerer",
      "Comment by @Unavailable author",
    ]);
  });

  it("preserves technical Markdown and excludes GitHub controls", () => {
    const post = assistantBlocks(adapter().getConversationDocument()!)[0];
    expect(post.html).toContain("<table>");
    expect(post.html).toContain('lang="typescript"');
    expect(post.html).toContain("<details>");
    expect(post.html).toContain("Synthetic architecture diagram");
    expect(post.text).toContain("[x] Preserve task lists");
    expect(post.text).not.toContain("React");
    expect(post.html).not.toMatch(/<button|<script|javascript:/i);
    expect(post.provenance.sourceConversationId).toBe("repo:example/reader#42");
  });

  it("marks accepted and edited entries semantically without reordering them", () => {
    const responses = assistantBlocks(adapter().getConversationDocument()!);
    expect(responses[1].text).toContain("Edited");
    expect(responses[3].text).toContain("Accepted answer");
    expect(responses[3].text).toContain("The accepted answer remains chronological.");
  });

  it("deduplicates a stale mounted entry in favor of the later DOM node", () => {
    const doc = fixtureDocument();
    const stale = doc.createElement("article");
    stale.dataset.testid = "discussion-comment";
    stale.dataset.discussionCommentId = "1001";
    stale.innerHTML = '<a class="author">reviewer</a><div class="markdown-body">Stale copy.</div>';
    doc.querySelector('[data-testid="discussion-comment"]')!.before(stale);
    const matching = assistantBlocks(adapter(doc).getConversationDocument()!).filter(
      (response) => response.provenance.sourceMessageId === "1001",
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].text).toContain("Use semantic attributes");
  });

  it("returns a bounded refresh snapshot and observes page changes", async () => {
    const result = await adapter().scanConversationDocument();
    expect(result.terminationReason).toBe("single-snapshot");
    expect(result.document).not.toBeNull();

    vi.useFakeTimers();
    const doc = fixtureDocument();
    const callback = vi.fn();
    const stop = adapter(doc).observePageChanges(callback);
    doc.querySelector('[data-discussion-comment-id="1004"] p')!.textContent += " Updated.";
    await vi.advanceTimersByTimeAsync(181);
    expect(callback).toHaveBeenCalledOnce();
    stop();
    vi.useRealTimers();
  });

  it("keeps a large currently rendered discussion ordered without duplicate entries", () => {
    const doc = fixtureDocument();
    const root = doc.querySelector("main")!;
    root.querySelectorAll('[data-testid="discussion-comment"]').forEach((entry) => entry.remove());
    for (let index = 1; index <= 120; index += 1) {
      const entry = doc.createElement("article");
      entry.dataset.testid = "discussion-comment";
      entry.dataset.discussionCommentId = `large-${index}`;
      entry.innerHTML = `<a class="author">user-${index}</a><div class="markdown-body"><p>Entry ${index}</p></div>`;
      root.append(entry);
    }
    const responses = assistantBlocks(adapter(doc).getConversationDocument()!);
    expect(responses).toHaveLength(121);
    expect(responses[1].text).toContain("Entry 1");
    expect(responses.at(-1)?.text).toContain("Entry 120");
    expect(new Set(responses.map((response) => response.id)).size).toBe(responses.length);
  });

  it("extracts and refreshes an organisation discussion with isolated identity and no sidebar content", async () => {
    const doc = new DOMParser().parseFromString(ORGANIZATION_FIXTURE, "text/html");
    const organizationAdapter = new GitHubDiscussionsAdapter(
      doc,
      "github.com",
      "https://github.com/orgs/community/discussions/203678",
    );
    expect(organizationAdapter.shouldInjectControl()).toBe(true);
    const conversation = organizationAdapter.getConversationDocument()!;
    const responses = assistantBlocks(conversation);
    expect(conversation).toMatchObject({
      source: "github-discussion",
      title: "Organisation discussions should be readable",
      sourceUrl: "https://github.com/orgs/community/discussions/203678",
      sourceContext: {
        details: ["community organisation", "Discussion #203678", "Discussions", "Answered"],
      },
    });
    expect(responses.map((response) => response.provenance.sourceMessageId)).toEqual([
      "original-post",
      "9001",
      "9002",
      "9003",
    ]);
    expect(responses.map((response) => response.provenance.sourceConversationId)).toEqual(
      Array(4).fill("org:community#203678"),
    );
    expect(responses.map((response) => response.sectionTitle)).toEqual([
      "Original post by @starter",
      "Comment by @participant",
      "Reply by @helper to @participant",
      "Comment by @answerer",
    ]);
    expect(responses[0].html).toContain("<table>");
    expect(responses[0].html).toContain('lang="javascript"');
    expect(responses[0].html).toContain("Synthetic diagram");
    expect(responses[3].text).toContain("Accepted answer");
    expect(responses.map((response) => response.text).join(" ")).not.toContain("Sidebar content");
    expect(responses.map((response) => response.text).join(" ")).not.toContain("React");
    const refresh = await organizationAdapter.scanConversationDocument();
    expect(refresh).toMatchObject({ completed: true, terminationReason: "single-snapshot" });
    expect(refresh.document?.id).toBe(conversation.id);
  });

  it("does not expose the control for an organisation discussion shell without content", () => {
    const shell = new DOMParser().parseFromString(
      "<main><h1>Loading discussion</h1><button>Discussion options</button></main>",
      "text/html",
    );
    const organizationAdapter = new GitHubDiscussionsAdapter(
      shell,
      "github.com",
      "https://github.com/orgs/community/discussions/203678",
    );
    expect(organizationAdapter.isSupportedPage()).toBe(true);
    expect(organizationAdapter.shouldInjectControl()).toBe(false);
    expect(organizationAdapter.getConversationDocument()).toBeNull();
  });
});
