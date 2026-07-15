import { describe, expect, it, vi } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";

describe("ChatGPTAdapter", () => {
  it("checks assistant availability without extracting or cloning the conversation", () => {
    document.body.innerHTML = `
      <article data-turn="user"><p>First prompt</p></article>
      <article data-turn="user"><p>Second prompt</p></article>
      <article data-turn="assistant"><div data-message-content></div></article>
    `;
    const adapter = new ChatGPTAdapter(document, "chatgpt.com");
    const extraction = vi.spyOn(adapter, "getConversationDocument");
    const cloneNode = vi.spyOn(Element.prototype, "cloneNode");

    expect(adapter.hasLatestAssistantResponse()).toBe(true);
    expect(extraction).not.toHaveBeenCalled();
    expect(cloneNode).not.toHaveBeenCalled();
  });

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

  it("preserves response images and captions in logical order while excluding artifact controls", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="visual-answer">
        <div data-message-content>
          <p>Before chart</p>
          <figure data-testid="generated-chart">
            <img src="data:image/png;base64,AAAA" alt="Napoleon campaign chart" width="640" height="320">
            <figcaption>Army size over time</figcaption>
            <button aria-label="Download chart">Download</button>
          </figure>
          <p>After chart</p>
          <pre><code class="language-python">print("done")</code></pre>
        </div>
      </article>
    `;

    const response = new ChatGPTAdapter(document, "chatgpt.com").getLatestAssistantResponse()!;
    expect(response.html.indexOf("Before chart")).toBeLessThan(response.html.indexOf("<figure"));
    expect(response.html.indexOf("<figure")).toBeLessThan(response.html.indexOf("After chart"));
    expect(response.html).toContain('alt="Napoleon campaign chart"');
    expect(response.html).toContain("<figcaption>Army size over time</figcaption>");
    expect(response.html).toContain('<code lang="python">');
    expect(response.html).not.toContain("Download");
  });

  it("normalizes live-output citation favicons without promoting them to document media", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="citation-regression">
        <div data-message-content>
          <p>
            Supporting sources
            <a data-testid="citation-chip" href="https://www.masswerk.at/example?utm_source=chatgpt.com">
              <img alt="" width="128" height="128" src="https://www.google.com/s2/favicons?domain=https://www.masswerk.at&amp;sz=128">
              <span>mass:werk</span><span>+1</span>
            </a>
            <a data-testid="source-reference" href="https://datavizblog.com/napoleon?utm_medium=chat">
              <img alt="" width="128" height="128" src="https://icons.example.test/favicon.png">
              <span>datavizblog.com</span>
            </a>
          </p>
          <img alt="" width="128" height="128" src="https://images.example.test/not-a-chart.png">
        </div>
      </article>
    `;

    const response = new ChatGPTAdapter(document, "chatgpt.com").getLatestAssistantResponse()!;
    const output = document.createElement("div");
    output.innerHTML = response.html;

    expect(output.querySelectorAll("img")).toHaveLength(0);
    expect(output.querySelectorAll("figure")).toHaveLength(0);
    expect(output.querySelectorAll("cite")).toHaveLength(2);
    expect(
      output.querySelector('cite a[href="https://www.masswerk.at/example"]')?.textContent,
    ).toBe("Source: mass:werk");
    expect(
      output.querySelector('cite a[href="https://datavizblog.com/napoleon"]')?.textContent,
    ).toBe("Source: datavizblog.com");
    expect(response.html).not.toContain("s2/favicons");
    expect(response.html).not.toContain("+1");
    expect(response.html).not.toContain("Visual could not be captured");
    expect(response.text).toContain("Source: mass:werk");
  });

  it.each([
    ["Python", "python", "import matplotlib.pyplot as plt"],
    ["TypeScript", "typescript", "const answer: number = 42;"],
  ])("moves a supported %s host label into code metadata", (hostLabel, language, codeText) => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="language-${language}">
        <div data-message-content>
          <div data-testid="code-block">
            <div data-testid="code-block-header"><span>${hostLabel}</span><button>Copy code</button></div>
            <pre><code>${codeText}\n</code></pre>
          </div>
        </div>
      </article>
    `;

    const response = new ChatGPTAdapter(document, "chatgpt.com").getLatestAssistantResponse()!;
    const output = document.createElement("div");
    output.innerHTML = response.html;
    const code = output.querySelector("code")!;

    expect(code.getAttribute("lang")).toBe(language);
    expect(code.textContent).toBe(`${codeText}\n`);
    expect(response.text).toBe(codeText);
    expect(response.html).not.toContain(hostLabel);
    expect(response.html).not.toContain("Copy code");
  });

  it("retains an image-only assistant response", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="image-only">
        <figure><img src="data:image/png;base64,AAAA" alt="Generated map"></figure>
      </article>
    `;
    const response = new ChatGPTAdapter(document, "chatgpt.com").getLatestAssistantResponse();
    expect(response?.id).toBe("image-only");
    expect(response?.text).toBe("Generated map");
  });

  it("captures a meaningful canvas locally and falls back safely when capture fails", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="canvas-success">
        <p>Canvas result</p><figure><canvas width="600" height="300" aria-label="Generated chart"></canvas></figure>
      </article>
      <article data-turn="assistant" data-message-id="canvas-failure">
        <p>Restricted result</p><div data-testid="chart-output"><canvas width="600" height="300"></canvas></div>
      </article>
    `;
    const canvases = document.querySelectorAll("canvas");
    vi.spyOn(canvases[0], "toDataURL").mockReturnValue("data:image/png;base64,AAAA");
    vi.spyOn(canvases[1], "toDataURL").mockImplementation(() => {
      throw new DOMException("Tainted canvas", "SecurityError");
    });

    const responses = new ChatGPTAdapter(document, "chatgpt.com").getAllAssistantResponses();
    expect(responses[0].html).toContain('src="data:image/png;base64,AAAA"');
    expect(responses[0].html).toContain('width="600"');
    expect(responses[1].html).toContain("Visual could not be captured.");
    expect(responses[1].text).toContain("Restricted result");
  });

  it("does not preserve raw SVG or visual controls as response media", () => {
    document.body.innerHTML = `
      <article data-turn="assistant" data-message-id="svg-chart">
        <p>SVG result</p>
        <div data-testid="generated-chart"><svg aria-label="Chart" viewBox="0 0 600 300"><path d="M0 0"></path></svg></div>
        <button><img src="data:image/png;base64,AAAA" alt="Download icon"></button>
      </article>
    `;
    const response = new ChatGPTAdapter(document, "chatgpt.com").getLatestAssistantResponse()!;
    expect(response.html).not.toContain("<svg");
    expect(response.html).not.toContain("Download icon");
    expect(response.html).toContain("Visual could not be captured.");
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
