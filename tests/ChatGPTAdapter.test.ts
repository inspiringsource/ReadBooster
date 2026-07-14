import { describe, expect, it, vi } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";

describe("ChatGPTAdapter", () => {
  it("extracts a normalized conversation in chronological user/assistant turns", () => {
    document.body.innerHTML = `
      <article data-turn="user" data-message-id="prompt-1"><div data-message-content><p>First prompt</p></div></article>
      <article data-turn="assistant" data-message-id="answer-1"><div data-message-content><h2>First answer</h2></div></article>
      <article data-message-author-role="user" data-message-id="prompt-2"><div class="prose"><p>Second prompt</p></div></article>
      <article data-message-author-role="assistant" data-message-id="answer-2"><div class="markdown"><p>Second answer</p></div></article>
    `;

    const conversation = new ChatGPTAdapter(
      document,
      "chatgpt.com",
      "https://chatgpt.com/c/conversation-123",
    ).getConversationDocument();

    expect(conversation).toMatchObject({
      id: "chatgpt-conversation-123",
      source: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/conversation-123",
    });
    expect(conversation?.turns.map((turn) => [turn.prompt?.text, turn.response?.text])).toEqual([
      ["First prompt", "First answer"],
      ["Second prompt", "Second answer"],
    ]);
    expect(conversation?.turns.flatMap((turn) => [turn.prompt?.role, turn.response?.role])).toEqual(
      ["user", "assistant", "user", "assistant"],
    );
  });

  it("preserves incomplete and unusual turn transitions safely", () => {
    document.body.innerHTML = `
      <article data-turn="user" data-message-id="prompt-only"><p>Prompt only</p></article>
      <article data-turn="user" data-message-id="paired-prompt"><p>Paired prompt</p></article>
      <article data-turn="assistant" data-message-id="paired-answer"><p>Paired answer</p></article>
      <article data-turn="assistant" data-message-id="answer-only"><p>Answer only</p></article>
      <article data-turn="user" data-message-id="streaming-prompt"><p>Streaming prompt</p></article>
      <article data-turn="assistant" data-message-id="empty-stream"><div data-message-content></div></article>
    `;

    const turns = new ChatGPTAdapter(document, "chatgpt.com").getConversationDocument()?.turns;
    expect(turns?.map((turn) => [turn.prompt?.id ?? null, turn.response?.id ?? null])).toEqual([
      ["prompt-only", null],
      ["paired-prompt", "paired-answer"],
      [null, "answer-only"],
      ["streaming-prompt", null],
    ]);
    expect(turns?.map((turn) => turn.index)).toEqual([0, 1, 2, 3]);
  });

  it("captures immutable original-source provenance and deterministic fallback IDs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
    document.body.innerHTML = `
      <article data-message-author-role="user"><div data-message-content><p>No host ID prompt</p></div></article>
      <article data-message-author-role="assistant"><div data-message-content><p>No host ID answer</p></div></article>
    `;
    const adapter = new ChatGPTAdapter(
      document,
      "chatgpt.com",
      "https://chatgpt.com/c/fallback-test",
    );

    const first = adapter.getConversationDocument()!;
    const second = adapter.getConversationDocument()!;
    const firstBlocks = first.turns.flatMap((turn) => [turn.prompt!, turn.response!]);
    const secondBlocks = second.turns.flatMap((turn) => [turn.prompt!, turn.response!]);

    expect(firstBlocks.map((block) => block.id)).toEqual(secondBlocks.map((block) => block.id));
    expect(firstBlocks.map((block) => block.provenance)).toEqual(
      secondBlocks.map((block) => block.provenance),
    );
    expect(firstBlocks[0].provenance).toMatchObject({
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/fallback-test",
      sourceConversationId: "fallback-test",
      extractedAt: "2026-07-14T12:00:00.000Z",
    });
    expect(firstBlocks[0].provenance.contentFingerprint).toMatch(/^djb2-/);
    expect(firstBlocks[0].provenance.sourceMessageId).toBeUndefined();
    vi.useRealTimers();
  });

  it("derives compatibility response helpers from the normalized document", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="one"><p>One</p></article>
      <article data-turn="assistant" data-message-id="two"><p>Two</p></article>
    `;
    const adapter = new ChatGPTAdapter(document, "chatgpt.com");
    const conversation = adapter.getConversationDocument();
    const documentSpy = vi.spyOn(adapter, "getConversationDocument").mockReturnValue(conversation);

    expect(adapter.getAllAssistantResponses().map((response) => response.id)).toEqual([
      "one",
      "two",
    ]);
    expect(adapter.getLatestAssistantResponse()?.id).toBe("two");
    expect(documentSpy).toHaveBeenCalledTimes(2);
  });

  it("returns null safely when no assistant response exists", () => {
    document.body.innerHTML = '<main><div data-message-author-role="user">Hello</div></main>';
    const adapter = new ChatGPTAdapter(document, "chatgpt.com");

    expect(adapter.getLatestAssistantResponse()).toBeNull();
    expect(adapter.getAllAssistantResponses()).toEqual([]);
  });

  it("extracts the latest assistant response and removes host controls", () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="assistant" data-message-id="first-answer">
          <div class="markdown"><p>Earlier answer</p></div>
        </article>
        <article data-message-author-role="assistant" data-message-id="latest-answer">
          <div class="markdown">
            <h2>Latest answer</h2>
            <p>Keep <strong>semantic content</strong> and <a href="https://example.com">links</a>.</p>
            <ul><li>First item</li><li>Second item</li></ul>
            <pre><code>const safe = true;</code></pre>
            <table><tbody><tr><th>Kind</th><td>Example</td></tr></tbody></table>
            <button aria-label="Copy response">Copy</button>
            <script>window.bad = true;</script>
          </div>
          <div role="button" aria-label="Read aloud">Audio</div>
        </article>
      </main>
    `;

    const response = new ChatGPTAdapter(document, "chatgpt.com").getLatestAssistantResponse();

    expect(response).not.toBeNull();
    expect(response?.id).toBe("latest-answer");
    expect(response?.text).toContain("Latest answer");
    expect(response?.html).toMatch(/<h2 id="rb-content-latest-answer-[^"]+">Latest answer<\/h2>/);
    expect(response?.html).toContain("<pre><code>const safe = true;</code></pre>");
    expect(response?.html).toContain("<table>");
    expect(response?.html).not.toContain("button");
    expect(response?.html).not.toContain("script");
    expect(response?.html).not.toContain("Read aloud");
    expect(response?.html).toContain('target="_blank"');
    expect(response?.html).toContain('rel="noopener noreferrer"');
  });

  it("fails safely on a non-ChatGPT hostname", () => {
    document.body.innerHTML = '<div data-message-author-role="assistant"><p>Answer</p></div>';
    const adapter = new ChatGPTAdapter(document, "example.com");
    expect(adapter.getLatestAssistantResponse()).toBeNull();
  });

  it("combines mixed selector families and chooses the newest turn in document order", () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="old-shape">
        <div class="markdown"><p>Old selector family</p></div>
      </article>
      <article data-turn="assistant" data-testid="conversation-turn-new-shape">
        <div data-message-content><p>Newest response</p></div>
      </article>
    `;

    const adapter = new ChatGPTAdapter(document, "chatgpt.com");
    const getAllSpy = vi.spyOn(adapter, "getAllAssistantResponses").mockImplementation(() => {
      throw new Error("latest extraction must not call getAllAssistantResponses");
    });

    const latest = adapter.getLatestAssistantResponse();
    expect(latest?.id).toBe("conversation-turn-new-shape");
    expect(latest?.text).toBe("Newest response");
    expect(getAllSpy).not.toHaveBeenCalled();
  });

  it("uses only plausible turn-author positions for the fallback selector", () => {
    document.body.innerHTML = `
      <article data-testid="conversation-turn-control-only">
        <button aria-label="Assistant">Menu</button>
        <p>Not an identified assistant response</p>
      </article>
      <article data-testid="conversation-turn-labeled">
        <header><h6>ChatGPT said:</h6></header>
        <div class="markdown"><p>Fallback response</p></div>
      </article>
    `;

    const responses = new ChatGPTAdapter(document, "chatgpt.com").getAllAssistantResponses();
    expect(responses).toHaveLength(1);
    expect(responses[0].id).toBe("conversation-turn-labeled");
  });

  it("returns every valid assistant response in actual document order", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-testid="conversation-turn-1">
        <div data-message-content><p>First response</p></div>
      </article>
      <article data-message-author-role="assistant" data-message-id="second-response">
        <div class="markdown"><p>Second response</p></div>
      </article>
      <article data-testid="conversation-turn-3">
        <header><h6>ChatGPT said:</h6></header>
        <div class="markdown"><p>Third response</p></div>
      </article>
    `;

    const responses = new ChatGPTAdapter(document, "chatgpt.com").getAllAssistantResponses();
    expect(responses.map((response) => response.text)).toEqual([
      "First response",
      "Second response",
      "Third response",
    ]);
  });
});
