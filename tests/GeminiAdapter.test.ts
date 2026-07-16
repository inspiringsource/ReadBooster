import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiAdapter } from "../src/content/adapters/GeminiAdapter";
import { createOptimizationService } from "../src/content/optimization";
import { mergeConversationDocuments } from "../src/shared/conversation";
import { sectionTitleOverrideIdentity } from "../src/shared/sectionTitleOverrides";

const FIXTURE = readFileSync("tests/fixtures/gemini-conversation.html", "utf8");
const BUTTON_IMAGE_FIXTURE = readFileSync("tests/fixtures/gemini-button-image.html", "utf8");
const EMPTY_FIXTURE = readFileSync("tests/fixtures/gemini-no-response.html", "utf8");
const SOURCE_URL = "https://gemini.google.com/app/fixture-url-conversation";

function fixtureDocument(html = FIXTURE): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.title = "Fixture conversation - Google Gemini";
  return doc;
}

function adapter(doc = fixtureDocument(), hostname = "gemini.google.com"): GeminiAdapter {
  return new GeminiAdapter(doc, hostname, SOURCE_URL);
}

afterEach(() => vi.useRealTimers());

describe("GeminiAdapter", () => {
  it("supports only the exact Gemini hostname and exposes implemented, unverified capabilities", () => {
    expect(adapter().isSupportedPage()).toBe(true);
    expect(adapter(fixtureDocument(), "gemini.google.com.").isSupportedPage()).toBe(true);
    expect(adapter(fixtureDocument(), "labs.gemini.google.com").isSupportedPage()).toBe(false);
    expect(adapter(fixtureDocument(), "gemini.google.example").isSupportedPage()).toBe(false);
    expect(
      new GeminiAdapter(
        fixtureDocument(),
        "gemini.google.com",
        "https://gemini.google.com/faq",
      ).isSupportedPage(),
    ).toBe(false);
    expect(adapter().capabilities).toEqual({
      configured: true,
      implemented: true,
      manuallyVerified: false,
      canExtractResponses: true,
    });
  });

  it("detects an assistant candidate without running normalized extraction", () => {
    const current = adapter();
    const extraction = vi.spyOn(current, "getConversationDocument");

    expect(current.hasLatestAssistantResponse()).toBe(true);
    expect(extraction).not.toHaveBeenCalled();
    expect(adapter(fixtureDocument(EMPTY_FIXTURE)).hasLatestAssistantResponse()).toBe(false);
  });

  it("extracts chronological normalized turns, stable provenance, and assistant-only content", () => {
    const conversation = adapter().getConversationDocument()!;

    expect(conversation).toMatchObject({
      id: "gemini-fixture-gemini-conversation",
      source: "gemini",
      title: "Fixture conversation",
      sourceUrl: SOURCE_URL,
    });
    expect(conversation.turns).toHaveLength(4);
    expect(
      conversation.turns.map((turn) => [turn.prompt?.id ?? null, turn.response?.id ?? null]),
    ).toEqual([
      ["gemini-query-1", "gemini-response-1"],
      ["gemini-query-2", "gemini-response-2"],
      [null, "gemini-response-3"],
      ["gemini-query-4", "gemini-response-4"],
    ]);

    const first = conversation.turns[0].response!;
    expect(first.provenance).toMatchObject({
      kind: "original",
      platform: "gemini",
      sourceUrl: SOURCE_URL,
      sourceConversationId: "fixture-gemini-conversation",
      sourceMessageId: "gemini-response-1",
    });
    expect(first.provenance.contentFingerprint).toMatch(/^djb2-/);
    expect(sectionTitleOverrideIdentity(conversation, first).persistable).toBe(true);
  });

  it("preserves semantic content while removing host controls, hidden drafts, and unsafe markup", () => {
    const conversation = adapter().getConversationDocument()!;
    const first = conversation.turns[0].response!;

    expect(first.html).toContain("<h2");
    expect(first.html).toContain("<h3");
    expect(first.html).toContain("<ul>");
    expect(first.html).toContain("Nested detail");
    expect(first.html).toContain("<blockquote>");
    expect(first.text).toContain("Formula: x² + y²");
    expect(first.html).toContain("<table>");
    expect(first.html).toContain('scope="col"');
    expect(first.html).toContain('scope="row"');
    expect(first.html).toContain('colspan="1"');
    expect(first.html).toContain('rowspan="1"');
    expect(first.html).toContain('<code lang="python">');
    expect(fixtureDocument(`<div>${first.html}</div>`).querySelector("code")?.textContent).toBe(
      "def answer():\n    return 42",
    );
    expect(first.html).toContain("<figure");
    expect(first.html).toContain('alt="Generated Gemini diagram"');
    expect(first.html).toContain("<figcaption>Generated Gemini diagram</figcaption>");
    expect(first.html).toContain("<cite>");
    expect(first.html).toContain("Example reference");
    expect(first.html).toContain("item=1");
    expect(first.html).not.toContain("utm_source");
    expect(first.html).not.toContain("s2/favicons");
    expect(first.html).not.toContain("+1");
    expect(first.html).not.toMatch(/<button|<svg|<script|Share response|Read aloud/);
    expect(first.html).not.toContain("Hidden alternative draft");
  });

  it("normalizes the live-derived Gemini image button into one inert semantic figure", () => {
    const response = adapter(fixtureDocument(BUTTON_IMAGE_FIXTURE)).getConversationDocument()!
      .turns[0].response!;
    const output = fixtureDocument(`<div>${response.html}</div>`);
    const figure = output.querySelector("figure");
    const image = figure?.querySelector("img");

    expect(output.querySelectorAll("img")).toHaveLength(1);
    expect(output.querySelectorAll("figure")).toHaveLength(1);
    expect(output.querySelector("button")).toBeNull();
    expect(image).toMatchObject({
      alt: "The Federal Palace in Bern, AI generated",
      width: 2048,
      height: 1365,
    });
    expect(image?.getAttribute("src")).toBe(
      "https://encrypted-tbn1.gstatic.com/licensed-image?q=redacted-fixture",
    );
    expect(figure?.querySelector("figcaption")).toBeNull();
    expect(response.html).not.toMatch(
      /jslog|_ngcontent|ng-star-inserted|spark-licensed|hero-image/,
    );
    expect(response.html.indexOf("Introductory response paragraph.")).toBeLessThan(
      response.html.indexOf("<figure"),
    );
    expect(response.html.indexOf("<figure")).toBeLessThan(
      response.html.indexOf("Following response explanation."),
    );
    expect(response.text).toContain("The Federal Palace in Bern, AI generated");
  });

  it("keeps rejecting control, citation, avatar, unsafe, and structurally unrelated images", () => {
    const response = adapter(fixtureDocument(BUTTON_IMAGE_FIXTURE)).getConversationDocument()!
      .turns[0].response!;

    expect(response.html).not.toMatch(
      /copy\.png|share\.png|audio\.png|avatar\.png|s2\/favicons|empty-alt|declared-large|one-class-only|javascript:|source-thumbnail\.png|<svg/,
    );
    expect(response.html).toContain("Fixture source");
    expect(response.html).toContain("https://example.test/source");
    expect(response.html).not.toContain("<button");
    expect(response.html).not.toContain("Visual could not be captured");
  });

  it("retains an otherwise image-only response when the wrapped image qualifies", () => {
    const imageOnly = fixtureDocument(`
      <chat-app data-conversation-id="image-only">
        <model-response data-response-id="image-only-response">
          <message-content>
            <button class="image-button">
              <img class="hero-image" alt="Meaningful generated landscape" width="900" height="600"
                src="https://encrypted-tbn1.gstatic.com/licensed-image?q=image-only-fixture">
            </button>
          </message-content>
        </model-response>
      </chat-app>`);
    const response = adapter(imageOnly).getConversationDocument()?.turns[0].response;

    expect(response?.html).toContain("<figure>");
    expect(response?.html).toContain('alt="Meaningful generated landscape"');
    expect(response?.text).toBe("Meaningful generated landscape");
  });

  it("preserves the relative order of multiple qualifying wrapped images", () => {
    const multiple = fixtureDocument(`
      <chat-app data-conversation-id="multiple-images">
        <model-response data-response-id="multiple-image-response">
          <message-content>
            <p>Before images.</p>
            <button class="image-button"><img class="hero-image" alt="First image" width="800"
              height="500" src="https://example.test/first.png"></button>
            <p>Between images.</p>
            <button class="image-button"><img class="spark-licensed-landscape" alt="Second image"
              width="900" height="600" src="https://example.test/second.png"></button>
            <p>After images.</p>
          </message-content>
        </model-response>
      </chat-app>`);
    const response = adapter(multiple).getConversationDocument()!.turns[0].response!;

    expect(response.html.match(/<figure>/g)).toHaveLength(2);
    expect(response.html.indexOf("Before images.")).toBeLessThan(
      response.html.indexOf("First image"),
    );
    expect(response.html.indexOf("First image")).toBeLessThan(
      response.html.indexOf("Between images."),
    );
    expect(response.html.indexOf("Between images.")).toBeLessThan(
      response.html.indexOf("Second image"),
    );
    expect(response.html.indexOf("Second image")).toBeLessThan(
      response.html.indexOf("After images."),
    );
  });

  it("transfers supported code labels and leaves unlabeled code plain", () => {
    const second = adapter().getConversationDocument()!.turns[1].response!;
    const root = fixtureDocument(`<div>${second.html}</div>`);
    const codes = Array.from(root.querySelectorAll("pre code"));

    expect(codes).toHaveLength(3);
    expect(codes.map((code) => code.getAttribute("lang"))).toEqual(["javascript", "json", null]);
    expect(codes[0].textContent).toBe("const value = 2;\nconsole.log(value);");
    expect(codes[1].textContent).toBe('{"value": 2}');
    expect(second.html).not.toMatch(/>JavaScript<|>JSON</);
    expect(second.html).not.toContain("javascript:alert");
    expect(second.html).not.toContain("unrelated-large-asset");
  });

  it("derives compatibility helpers from the normalized document", () => {
    const current = adapter();
    const all = current.getAllAssistantResponses();
    const latest = current.getLatestAssistantResponse();

    expect(all).toHaveLength(4);
    expect(all.map((response) => response.source)).toEqual([
      "gemini",
      "gemini",
      "gemini",
      "gemini",
    ]);
    expect(latest?.id).toBe("gemini-response-4");
    expect(latest?.text).toContain("Currently available partial response.");
  });

  it("returns null safely when no eligible response exists", () => {
    const current = adapter(fixtureDocument(EMPTY_FIXTURE));
    expect(current.getConversationDocument()).toBeNull();
    expect(current.getLatestAssistantResponse()).toBeNull();
    expect(current.getAllAssistantResponses()).toEqual([]);
  });

  it("uses deterministic fallback IDs without collapsing identical no-ID responses", () => {
    const html = `
      <chat-app data-conversation-id="fallback-conversation">
        <chat-window-content>
          <model-response><message-content><p>Same answer</p></message-content></model-response>
          <model-response><message-content><p>Same answer</p></message-content></model-response>
        </chat-window-content>
      </chat-app>`;
    const first = adapter(fixtureDocument(html)).getConversationDocument()!;
    const second = adapter(fixtureDocument(html)).getConversationDocument()!;
    const firstIds = first.turns.map((turn) => turn.response!.id);

    expect(firstIds).toHaveLength(2);
    expect(new Set(firstIds).size).toBe(2);
    expect(second.turns.map((turn) => turn.response!.id)).toEqual(firstIds);
    expect(first.turns[0].response!.provenance.sourceMessageId).toBeUndefined();
    expect(sectionTitleOverrideIdentity(first, first.turns[0].response!).persistable).toBe(false);
  });

  it("deduplicates duplicate SPA nodes only by stable message identity", () => {
    const html = `
      <chat-app data-conversation-id="spa-conversation">
        <chat-window-content>
          <model-response data-response-id="stable-response"><message-content><p>Stale</p></message-content></model-response>
          <model-response data-response-id="stable-response"><message-content><p>Completed response</p></message-content></model-response>
          <model-response><message-content><p>Same generic markup</p></message-content></model-response>
          <model-response><message-content><p>Same generic markup</p></message-content></model-response>
        </chat-window-content>
      </chat-app>`;
    const conversation = adapter(fixtureDocument(html)).getConversationDocument()!;

    expect(conversation.turns).toHaveLength(3);
    expect(conversation.turns[0].response?.text).toBe("Completed response");
    expect(conversation.turns.slice(1).map((turn) => turn.response?.text)).toEqual([
      "Same generic markup",
      "Same generic markup",
    ]);
  });

  it("allows a richer streaming snapshot to update through the shared merge", () => {
    const doc = fixtureDocument();
    const current = adapter(doc);
    const initial = current.getConversationDocument()!;
    doc.querySelector('[data-response-id="gemini-response-4"] message-content')!.innerHTML =
      "<p>Currently available partial response with a completed explanation and conclusion.</p>";
    const completed = current.getConversationDocument()!;
    const merged = mergeConversationDocuments(initial, completed);

    expect(merged.turns.at(-1)?.response?.text).toContain("completed explanation and conclusion");
    expect(merged.turns).toHaveLength(initial.turns.length);
  });

  it("falls back to a single snapshot when no verified overflowing scroller exists", async () => {
    const result = await adapter().scanConversationDocument();
    expect(result.document?.turns).toHaveLength(4);
    expect(result).toMatchObject({
      scanPerformed: false,
      completed: false,
      terminationReason: "single-snapshot",
    });
  });

  it("uses the shared bounded scanner for a verified overflowing Gemini source and restores it", async () => {
    document.body.innerHTML = FIXTURE;
    document.title = "Fixture conversation - Google Gemini";
    const doc = document;
    const scroller = doc.querySelector<HTMLElement>('[data-test-id="conversation-scroll"]')!;
    scroller.style.overflowY = "auto";
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
    });
    scroller.scrollTop = 175;
    const scrollTo = vi.fn((optionsOrX?: ScrollToOptions | number, y?: number) => {
      scroller.scrollTop =
        typeof optionsOrX === "number" ? Number(y ?? 0) : Number(optionsOrX?.top ?? 0);
    });
    scroller.scrollTo = scrollTo as typeof scroller.scrollTo;

    const result = await adapter(doc).scanConversationDocument();

    expect(result).toMatchObject({
      scanPerformed: true,
      completed: true,
      terminationReason: "bottom",
    });
    expect(result.document?.turns).toHaveLength(4);
    expect(scroller.scrollTop).toBe(175);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 175, behavior: "auto" });
  });

  it("mounts through the shared optimization boundary and refreshes from a fresh snapshot", async () => {
    const doc = fixtureDocument();
    const current = adapter(doc);
    const mount = vi.fn().mockResolvedValue(undefined);
    const service = createOptimizationService(current, mount);

    expect(service.getStatus()).toMatchObject({
      supported: true,
      source: "gemini",
      implemented: true,
      canExtractResponses: true,
      responseAvailable: true,
    });
    expect(await service.optimizeLatest()).toMatchObject({
      ok: true,
      supported: true,
      source: "gemini",
    });
    const [initial, latest, refresh] = mount.mock.calls[0];
    expect(initial.turns).toHaveLength(4);
    expect(latest.id).toBe("gemini-response-4");

    const root = doc.querySelector("chat-window-content")!;
    const response = doc.createElement("model-response");
    response.setAttribute("data-response-id", "gemini-response-5");
    response.innerHTML = "<message-content><p>New response after opening.</p></message-content>";
    root.append(response);
    const refreshed = await refresh();

    expect(refreshed.terminationReason).toBe("single-snapshot");
    expect(refreshed.document.turns).toHaveLength(5);
    expect(refreshed.document.turns.at(-1).response.id).toBe("gemini-response-5");
  });

  it("debounces relevant SPA mutations, ignores its own insertion, and cleans up", async () => {
    vi.useFakeTimers();
    const doc = fixtureDocument();
    const current = adapter(doc);
    const callback = vi.fn();
    const cleanup = current.observePageChanges(callback);
    const root = doc.querySelector("chat-window-content")!;

    const ownControl = doc.createElement("div");
    ownControl.id = "readbooster-control-root";
    root.append(ownControl);
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();

    const response = doc.createElement("model-response");
    response.setAttribute("data-response-id", "new-response");
    response.innerHTML = "<message-content><p>New completed response</p></message-content>";
    root.append(response);
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledOnce();

    cleanup();
    root.append(doc.createElement("model-response"));
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledOnce();
  });
});
