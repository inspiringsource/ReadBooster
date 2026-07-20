import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MistralAdapter } from "../src/content/adapters/MistralAdapter";
import { createOptimizationService } from "../src/content/optimization";
import { mergeConversationDocuments } from "../src/shared/conversation";
import { sectionTitleOverrideIdentity } from "../src/shared/sectionTitleOverrides";

const FIXTURE = readFileSync("tests/fixtures/mistral-conversation.html", "utf8");
const SOURCE_URL = "https://chat.mistral.ai/work/fixture-url-conversation";

function fixtureDocument(html = FIXTURE): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.title = "Fixture fallback title - Mistral";
  return doc;
}

function adapter(
  doc = fixtureDocument(),
  hostname = "chat.mistral.ai",
  sourceUrl = SOURCE_URL,
): MistralAdapter {
  return new MistralAdapter(doc, hostname, sourceUrl);
}

afterEach(() => vi.useRealTimers());

describe("MistralAdapter", () => {
  it("supports production work and compatible chat routes while remaining honestly unverified", () => {
    expect(adapter().isSupportedPage()).toBe(true);
    expect(
      adapter(
        fixtureDocument(),
        "chat.mistral.ai",
        "https://chat.mistral.ai/chat/compatible-conversation",
      ).isSupportedPage(),
    ).toBe(true);
    expect(adapter(fixtureDocument(), "chat.mistral.ai.").isSupportedPage()).toBe(true);
    expect(adapter(fixtureDocument(), "mistral.ai").isSupportedPage()).toBe(false);
    expect(adapter(fixtureDocument(), "www.chat.mistral.ai").isSupportedPage()).toBe(false);
    expect(adapter(fixtureDocument(), "chat.mistral.example").isSupportedPage()).toBe(false);
    expect(
      adapter(fixtureDocument(), "chat.mistral.ai", "https://chat.mistral.ai/").isSupportedPage(),
    ).toBe(false);
    expect(adapter().capabilities).toEqual({
      configured: true,
      implemented: true,
      manuallyVerified: false,
      canExtractResponses: true,
    });
  });

  it("detects usable responses without performing normalized extraction", () => {
    const current = adapter();
    const extraction = vi.spyOn(current, "getConversationDocument");

    expect(current.hasLatestAssistantResponse()).toBe(true);
    expect(current.shouldInjectControl()).toBe(true);
    expect(extraction).not.toHaveBeenCalled();
    const empty = adapter(
      fixtureDocument('<main data-testid="conversation"></main>'),
      "chat.mistral.ai",
      "https://chat.mistral.ai/chat",
    );
    expect(empty.hasLatestAssistantResponse()).toBe(false);
    expect(empty.shouldInjectControl()).toBe(false);
  });

  it("detects each confirmed production assistant-content attribute independently", () => {
    const answerPart = adapter(
      fixtureDocument(`
        <main>
          <div data-response-id="answer-only">
            <div data-message-part-type="answer"><p>Production answer part.</p></div>
          </div>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/answer-part",
    );
    const testIdPart = adapter(
      fixtureDocument(`
        <main>
          <div data-response-id="test-id-only">
            <div data-testid="text-message-part"><p>Production test-ID answer.</p></div>
          </div>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/test-id-part",
    );

    expect(answerPart.hasLatestAssistantResponse()).toBe(true);
    expect(answerPart.getLatestAssistantResponse()?.text).toBe("Production answer part.");
    expect(answerPart.getLatestAssistantResponse()?.id).toBe("answer-only");
    expect(testIdPart.hasLatestAssistantResponse()).toBe(true);
    expect(testIdPart.getLatestAssistantResponse()?.text).toBe("Production test-ID answer.");
    expect(testIdPart.getLatestAssistantResponse()?.id).toBe("test-id-only");
  });

  it("uses a session-only DOM identity without deriving message identity from visible text", () => {
    const doc = fixtureDocument(`
      <main>
        <div data-message-part-type="answer"><p>First rendered text.</p></div>
      </main>`);
    const current = adapter(doc, "chat.mistral.ai", "https://chat.mistral.ai/work/fallback");
    const first = current.getLatestAssistantResponse();
    doc.querySelector("p")!.textContent = "Changed rendered text.";
    const updated = current.getLatestAssistantResponse();

    expect(first?.id).toBe("mistral-assistant-session-1");
    expect(updated?.id).toBe(first?.id);
    expect(
      current.getConversationDocument()?.turns[0]?.response?.provenance.sourceMessageId,
    ).toBeUndefined();
  });

  it("does not treat an unassociated editable Mistral Canvas surface as a conversation response", () => {
    const canvasOnly = adapter(
      fixtureDocument(`
        <main>
          <div data-message-quote-boundary="canvas">
            <div class="tiptap ProseMirror markdown-editor markdown-container-style">
              <h2>Canvas title</h2>
              <div data-testid="text-message-part">
                <p>Editable Canvas content.</p>
              </div>
            </div>
          </div>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/canvas-only",
    );

    expect(canvasOnly.hasLatestAssistantResponse()).toBe(false);
    expect(canvasOnly.shouldInjectControl()).toBe(false);
    expect(canvasOnly.getConversationDocument()).toBeNull();
    expect(
      adapter()
        .getConversationDocument()
        ?.turns.flatMap((turn) => turn.response?.text ?? []),
    ).not.toContain(
      "This Canvas must not be extracted because it is outside an assistant boundary.",
    );
  });

  it("uses an assistant-bound Canvas document instead of reasoning or its short answer", () => {
    const current = adapter(
      fixtureDocument(`
        <main data-testid="conversation">
          <div data-message-author-role="user" data-message-id="canvas-user">
            <div data-testid="message-content"><p>Create a document.</p></div>
          </div>
          <div data-message-author-role="assistant" data-message-id="canvas-assistant">
            <div data-message-part-type="reasoning" data-testid="text-message-part">
              <p>Private Canvas reasoning.</p>
            </div>
            <div data-message-part-type="answer" data-testid="text-message-part">
              <p>Canvas created successfully.</p>
            </div>
            <div data-message-quote-boundary="canvas">
              <div class="tiptap ProseMirror markdown-editor" contenteditable="true">
                <h1>Canvas report</h1>
                <p>Complete visible Canvas document.</p>
                <button aria-label="Edit Canvas">Edit</button>
              </div>
            </div>
          </div>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/canvas-document",
    );
    const conversation = current.getConversationDocument()!;
    const response = conversation.turns[0].response!;

    expect(current.shouldInjectControl()).toBe(true);
    expect(conversation.turns[0].prompt?.text).toBe("Create a document.");
    expect(response.id).toBe("canvas-assistant");
    expect(response.html).toContain("<h1");
    expect(response.text).toContain("Canvas report");
    expect(response.text).toContain("Complete visible Canvas document.");
    expect(response.text).not.toContain("Canvas created successfully.");
    expect(response.text).not.toContain("Private Canvas reasoning.");
    expect(response.html).not.toMatch(/contenteditable|<button|Edit Canvas/);
  });

  it("does not treat a reasoning-only assistant boundary as a completed response", () => {
    const reasoningOnly = adapter(
      fixtureDocument(`
        <main>
          <div data-message-author-role="assistant" data-message-id="reasoning-only">
            <div data-message-part-type="reasoning" data-testid="text-message-part">
              <p>Still reasoning.</p>
            </div>
          </div>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/reasoning-only",
    );

    expect(reasoningOnly.hasLatestAssistantResponse()).toBe(false);
    expect(reasoningOnly.shouldInjectControl()).toBe(false);
    expect(reasoningOnly.getConversationDocument()).toBeNull();
  });

  it("extracts all eligible turns chronologically with stable Mistral provenance", () => {
    const conversation = adapter().getConversationDocument()!;

    expect(conversation).toMatchObject({
      id: "mistral-fixture-url-conversation",
      source: "mistral",
      title: "Fixture Mistral conversation",
      sourceUrl: SOURCE_URL,
    });
    expect(
      conversation.turns.map((turn) => [turn.prompt?.id ?? null, turn.response?.id ?? null]),
    ).toEqual([
      ["mistral-user-1", "mistral-assistant-1"],
      ["mistral-user-2", "mistral-assistant-2"],
      [null, "mistral-assistant-only"],
      ["mistral-user-3", "mistral-assistant-3"],
    ]);
    const first = conversation.turns[0].response!;
    expect(first.provenance).toMatchObject({
      kind: "original",
      platform: "mistral",
      sourceConversationId: "fixture-url-conversation",
      sourceMessageId: "mistral-assistant-1",
    });
    expect(sectionTitleOverrideIdentity(conversation, first)).toMatchObject({ persistable: true });
    expect(conversation.turns[0].prompt?.text).toBe("Fixture prompt about a structured response.");
    expect(conversation.turns.flatMap((turn) => turn.response?.text ?? [])).not.toContain(
      "Sidebar preview that must remain outside the bounded conversation root.",
    );
  });

  it("preserves semantic response content and removes native controls and unsafe markup", () => {
    const response = adapter().getConversationDocument()!.turns[0].response!;
    const output = fixtureDocument(`<div>${response.html}</div>`);

    expect(response.html).toContain("<h2");
    expect(response.html).toContain("<h3");
    expect(response.html).toContain("<ul>");
    expect(response.html).toContain("<ol>");
    expect(response.html).toContain("<blockquote>");
    expect(response.text).toContain("Formula: x² + y²");
    expect(response.html).toContain("<table>");
    expect(response.html).toContain('scope="col"');
    expect(response.html).toContain('scope="row"');
    expect(response.html).toContain('<code lang="python">');
    expect(output.querySelector("pre code")?.textContent).toBe("def answer():\n    return 42");
    expect(response.html).toContain("<details>");
    expect(response.html).toContain("User-facing expanded detail.");
    expect(response.html).toContain("report.pdf");
    expect(response.html).not.toMatch(
      /<button|<svg|<script|Copy response|Share response|Listen|Retry/,
    );
    expect(response.html).not.toContain("Composer content");
    expect(response.text).not.toContain("Private reasoning that must never be extracted.");
    expect(response.text).not.toContain("Visual Alpha");
  });

  it("reconstructs a semantic table from a role grid only when rich HTML is unavailable", () => {
    const current = adapter(
      fixtureDocument(`
        <main>
          <div data-message-author-role="assistant" data-message-id="fallback-table">
            <div data-message-part-type="answer" data-testid="text-message-part">
              <div role="table">
                <div role="row">
                  <div role="columnheader">Name</div>
                  <div role="columnheader">Value</div>
                </div>
                <div role="row">
                  <div role="rowheader">Alpha</div>
                  <div role="cell">One <button>Menu</button></div>
                </div>
              </div>
            </div>
          </div>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/fallback-table",
    );
    const response = current.getLatestAssistantResponse()!;
    const output = fixtureDocument(`<div>${response.html}</div>`);

    expect(output.querySelectorAll("table")).toHaveLength(1);
    expect(output.querySelectorAll("thead th[scope='col']")).toHaveLength(2);
    expect(output.querySelector("tbody th")?.getAttribute("scope")).toBe("row");
    expect(output.querySelector("tbody td")?.textContent).toBe("One ");
    expect(response.html).not.toMatch(/role="table"|<button|Menu/);
  });

  it("normalizes citations, images, file references, and their semantic order", () => {
    const response = adapter().getConversationDocument()!.turns[0].response!;
    const output = fixtureDocument(`<div>${response.html}</div>`);
    const image = output.querySelector("figure img");

    expect(response.html).toContain("<cite>");
    expect(response.html).toContain("Example source");
    expect(response.html).toContain("item=1");
    expect(response.html).not.toContain("utm_source");
    expect(response.html).not.toContain("s2/favicons");
    expect(response.html).not.toContain("+1");
    expect(output.querySelectorAll("figure img")).toHaveLength(1);
    expect(image).toMatchObject({ alt: "Generated Mistral diagram", width: 640, height: 320 });
    expect(response.html.indexOf("Wide comparison")).toBeLessThan(
      response.html.indexOf("Generated Mistral diagram"),
    );
    expect(response.html.indexOf("Generated Mistral diagram")).toBeLessThan(
      response.html.indexOf("report.pdf"),
    );
  });

  it("transfers supported code labels and rejects unsafe/control images", () => {
    const response = adapter().getConversationDocument()!.turns[1].response!;
    const output = fixtureDocument(`<div>${response.html}</div>`);
    const code = output.querySelector("pre code");

    expect(code?.getAttribute("lang")).toBe("typescript");
    expect(code?.textContent).toBe("const value: number = 2;");
    expect(response.html).not.toContain(">TypeScript<");
    expect(response.html).not.toMatch(/javascript:|copy\.png|<button/);
  });

  it("keeps identical no-ID responses distinct with deterministic session IDs", () => {
    const html = `
      <main data-testid="conversation" data-conversation-id="fallback">
        <article data-message-role="assistant"><div data-message-content><p>Same answer</p></div></article>
        <article data-message-role="assistant"><div data-message-content><p>Same answer</p></div></article>
      </main>`;
    const first = adapter(fixtureDocument(html)).getConversationDocument()!;
    const second = adapter(fixtureDocument(html)).getConversationDocument()!;
    const firstIds = first.turns.map((turn) => turn.response!.id);

    expect(new Set(firstIds).size).toBe(2);
    expect(second.turns.map((turn) => turn.response!.id)).toEqual(firstIds);
    expect(sectionTitleOverrideIdentity(first, first.turns[0].response!).persistable).toBe(false);
  });

  it("deduplicates rerendered SPA nodes only by stable message identity", () => {
    const html = `
      <main data-testid="conversation" data-conversation-id="spa">
        <article data-message-role="assistant" data-message-id="stable"><div data-message-content><p>Stale</p></div></article>
        <article data-message-role="assistant" data-message-id="stable"><div data-message-content><p>Completed answer</p></div></article>
        <article data-message-role="assistant"><div data-message-content><p>Same markup</p></div></article>
        <article data-message-role="assistant"><div data-message-content><p>Same markup</p></div></article>
      </main>`;
    const conversation = adapter(fixtureDocument(html)).getConversationDocument()!;

    expect(conversation.turns).toHaveLength(3);
    expect(conversation.turns[0].response?.text).toBe("Completed answer");
    expect(conversation.turns.slice(1).map((turn) => turn.response?.text)).toEqual([
      "Same markup",
      "Same markup",
    ]);
  });

  it("allows a richer streaming response to update through the shared merge", () => {
    const doc = fixtureDocument();
    const current = adapter(doc);
    const initial = current.getConversationDocument()!;
    doc.querySelector(
      '[data-message-id="mistral-assistant-3"] [data-message-part-type="answer"]',
    )!.innerHTML = "<p>Currently available partial response with a completed conclusion.</p>";
    const merged = mergeConversationDocuments(initial, current.getConversationDocument()!);

    expect(merged.turns.at(-1)?.response?.text).toContain("completed conclusion");
    expect(merged.turns).toHaveLength(initial.turns.length);
  });

  it("uses URL identity first and a stable DOM conversation identity as fallback", () => {
    expect(adapter().getConversationDocument()?.id).toBe("mistral-fixture-url-conversation");
    const domFallback = adapter(
      fixtureDocument(),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work",
    ).getConversationDocument();
    expect(domFallback?.id).toBe("mistral-fixture-mistral-conversation");
  });

  it("returns null safely when no assistant response exists", () => {
    const current = adapter(
      fixtureDocument(`
        <main data-testid="conversation" data-conversation-id="empty">
          <article data-message-role="user" data-message-id="only-user">
            <div data-message-content><p>Waiting for an answer.</p></div>
          </article>
        </main>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/only-user",
    );
    expect(current.getConversationDocument()).toBeNull();
    expect(current.getLatestAssistantResponse()).toBeNull();
    expect(current.getAllAssistantResponses()).toEqual([]);
  });

  it("falls back to one snapshot without a verified overflowing source scroller", async () => {
    await expect(adapter().scanConversationDocument()).resolves.toMatchObject({
      scanPerformed: false,
      completed: false,
      terminationReason: "single-snapshot",
      document: { source: "mistral" },
    });
  });

  it("uses the shared bounded scanner and restores a verified source scroller", async () => {
    document.body.innerHTML = FIXTURE;
    document.title = "Fixture Mistral conversation";
    const thread = document.querySelector<HTMLElement>('[data-testid="conversation-thread"]')!;
    thread.style.overflowY = "auto";
    Object.defineProperties(thread, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
    });
    thread.scrollTop = 150;
    const scrollTo = vi.fn((optionsOrX?: ScrollToOptions | number, y?: number) => {
      thread.scrollTop =
        typeof optionsOrX === "number" ? Number(y ?? 0) : Number(optionsOrX?.top ?? 0);
    });
    thread.scrollTo = scrollTo as typeof thread.scrollTo;

    const result = await adapter(document).scanConversationDocument();

    expect(result).toMatchObject({
      scanPerformed: true,
      completed: true,
      terminationReason: "bottom",
    });
    expect(result.document?.turns).toHaveLength(4);
    expect(thread.scrollTop).toBe(150);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 150, behavior: "auto" });
  });

  it("mounts through the shared reader boundary and refreshes a fresh Mistral snapshot", async () => {
    const doc = fixtureDocument();
    const current = adapter(doc);
    const mount = vi.fn().mockResolvedValue(undefined);
    const service = createOptimizationService(current, mount);

    expect(service.getStatus()).toMatchObject({
      supported: true,
      source: "mistral",
      responseAvailable: true,
    });
    await expect(service.optimizeLatest()).resolves.toMatchObject({
      ok: true,
      source: "mistral",
    });
    const [initial, latest, refresh] = mount.mock.calls[0];
    expect(initial.turns).toHaveLength(4);
    expect(latest.id).toBe("mistral-assistant-3");

    const thread = doc.querySelector('[data-testid="conversation-thread"]')!;
    const response = doc.createElement("article");
    response.setAttribute("data-message-author-role", "assistant");
    response.setAttribute("data-message-id", "mistral-assistant-4");
    response.innerHTML =
      '<div data-message-part-type="answer" data-testid="text-message-part"><p>New response after opening.</p></div>';
    thread.append(response);
    const refreshed = await refresh();
    expect(refreshed.document.turns.at(-1).response.id).toBe("mistral-assistant-4");
  });

  it("debounces SPA mutations, ignores ReadBooster nodes, and cleans up", async () => {
    vi.useFakeTimers();
    const doc = fixtureDocument();
    const current = adapter(doc);
    const callback = vi.fn();
    const cleanup = current.observePageChanges(callback);
    const thread = doc.querySelector('[data-testid="conversation-thread"]')!;

    const ownControl = doc.createElement("div");
    ownControl.id = "readbooster-control-root";
    thread.append(ownControl);
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();

    const response = doc.createElement("article");
    response.setAttribute("data-message-author-role", "assistant");
    response.setAttribute("data-message-id", "new-response");
    response.innerHTML =
      '<div data-message-part-type="answer" data-testid="text-message-part"><p>Completed response</p></div>';
    thread.append(response);
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledOnce();

    cleanup();
    thread.append(doc.createElement("article"));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledOnce();
  });
});
