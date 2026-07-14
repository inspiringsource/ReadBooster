import { describe, expect, it } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";

describe("ChatGPTAdapter", () => {
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
    expect(response?.html).toContain("<h2>Latest answer</h2>");
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
});
