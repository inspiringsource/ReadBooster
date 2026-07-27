import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";
import { assistantBlocks } from "../src/shared/types";

const FIXTURE = readFileSync("tests/fixtures/claude-conversation.html", "utf8");

function fixtureDocument(): Document {
  return new DOMParser().parseFromString(FIXTURE, "text/html");
}

function adapter(
  doc = fixtureDocument(),
  url = "https://claude.ai/chat/fixture-claude-conversation",
): ClaudeAdapter {
  return new ClaudeAdapter(doc, "claude.ai", url);
}

describe("ClaudeAdapter", () => {
  it("supports only exact Claude conversation routes", () => {
    expect(adapter().isSupportedPage()).toBe(true);
    expect(adapter(fixtureDocument(), "https://claude.ai/new").isSupportedPage()).toBe(true);
    expect(adapter(fixtureDocument(), "https://claude.ai/settings/profile").isSupportedPage()).toBe(
      false,
    );
    expect(adapter(fixtureDocument(), "https://claude.ai/projects").isSupportedPage()).toBe(false);
    expect(
      new ClaudeAdapter(
        fixtureDocument(),
        "claude.ai.example.org",
        "https://claude.ai/chat/x",
      ).isSupportedPage(),
    ).toBe(false);
  });

  it("extracts ordered user and assistant messages with stable provenance", () => {
    const conversation = adapter().getConversationDocument();
    expect(conversation).not.toBeNull();
    expect(conversation?.source).toBe("claude");
    expect(conversation?.id).toBe("claude-fixture-claude-conversation");
    expect(conversation?.title).toBe("Fixture Claude conversation");
    expect(conversation?.turns).toHaveLength(3);
    expect(conversation?.turns.map((turn) => [turn.prompt?.id, turn.response?.id])).toEqual([
      ["claude-user-1", "claude-assistant-1"],
      ["claude-user-2", "claude-assistant-2"],
      ["claude-user-3", "claude-assistant-3"],
    ]);
    expect(conversation?.turns[0].response?.provenance).toMatchObject({
      platform: "claude",
      sourceConversationId: "fixture-claude-conversation",
      sourceMessageId: "claude-assistant-1",
    });
  });

  it("preserves semantic content and excludes Claude interface chrome", () => {
    const response = adapter().getConversationDocument()?.turns[0].response;
    expect(response).toBeTruthy();
    expect(response?.html).toContain("Claude adapter overview");
    expect(response?.html).toContain("<table>");
    expect(response?.html).toContain('lang="typescript"');
    expect(response?.html).toContain("Claude adapter diagram");
    expect(response?.html).toContain("Example source");
    expect(response?.html).not.toMatch(/Edit artifact|Copy response|Regenerate|Feedback/);
    expect(response?.html).not.toMatch(/<script|contenteditable|javascript:/i);
    expect(response?.text).not.toContain("Sidebar preview");
    expect(response?.text).not.toContain("Unassociated side-panel artifact");
    expect(response?.text).not.toContain("Hidden duplicate answer");
  });

  it("normalizes an associated document artifact once and leaves a code artifact as code", () => {
    const conversation = adapter().getConversationDocument()!;
    const documentArtifact = conversation.turns[0].response!;
    const codeArtifact = conversation.turns[1].response!;

    expect(documentArtifact.html.match(/data-readbooster-content-block="document"/g)).toHaveLength(
      1,
    );
    expect(documentArtifact.text.match(/Artifact findings/g)).toHaveLength(1);
    expect(documentArtifact.html).not.toContain("artifact-toolbar");
    expect(codeArtifact.html).toContain("export const ready = true;");
    expect(codeArtifact.html).not.toContain('data-readbooster-content-block="document"');
  });

  it("keeps a usable partial streaming response and ignores empty shells", () => {
    const responses = assistantBlocks(adapter().getConversationDocument()!);
    expect(responses).toHaveLength(3);
    expect(responses.at(-1)?.text).toContain("Currently available partial Claude response.");
    expect(responses.some((response) => response.id === "claude-empty-shell")).toBe(false);
    expect(adapter().hasLatestAssistantResponse()).toBe(true);
    expect(adapter().shouldInjectControl()).toBe(true);
  });

  it("fails safely for empty or malformed conversation DOM", () => {
    const empty = new DOMParser().parseFromString(
      '<main data-testid="conversation"><button>New chat</button></main>',
      "text/html",
    );
    const emptyAdapter = adapter(empty);
    expect(emptyAdapter.getConversationDocument()).toBeNull();
    expect(emptyAdapter.hasLatestAssistantResponse()).toBe(false);
    expect(emptyAdapter.shouldInjectControl()).toBe(false);
  });

  it("deduplicates rerendered stable message IDs in favor of the newest node", () => {
    const doc = fixtureDocument();
    const thread = doc.querySelector('[data-testid="conversation-thread"]')!;
    const stale = doc.createElement("div");
    stale.setAttribute("data-testid", "assistant-response");
    stale.setAttribute("data-message-id", "claude-assistant-2");
    stale.innerHTML = "<p>Stale duplicate response.</p>";
    thread.querySelector('[data-testid="assistant-response"]')?.before(stale);

    const responses = assistantBlocks(adapter(doc).getConversationDocument()!);
    expect(responses.filter((response) => response.id === "claude-assistant-2")).toHaveLength(1);
    expect(responses.find((response) => response.id === "claude-assistant-2")?.text).toContain(
      "The code artifact follows.",
    );
    expect(responses.some((response) => response.text.includes("Stale duplicate"))).toBe(false);
  });

  it("observes streamed text and route-replacement mutations with debouncing", () => {
    vi.useFakeTimers();
    const doc = fixtureDocument();
    const callback = vi.fn();
    const stop = adapter(doc).observePageChanges(callback);
    doc.querySelector('[data-message-id="claude-assistant-3"] p')!.textContent += " Complete.";
    return Promise.resolve()
      .then(() => vi.advanceTimersByTimeAsync(181))
      .then(() => {
        expect(callback).toHaveBeenCalledOnce();
        stop();
        vi.useRealTimers();
      });
  });

  it("uses the bounded single-snapshot refresh fallback when no scroller is proven", async () => {
    const result = await adapter().scanConversationDocument();
    expect(result.scanPerformed).toBe(false);
    expect(result.terminationReason).toBe("single-snapshot");
    expect(assistantBlocks(result.document!)).toHaveLength(3);
  });
});
