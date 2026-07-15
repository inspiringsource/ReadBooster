import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { ResponseOutline } from "../src/reader/ResponseOutline";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function block(id: string, sourceHtml: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = sourceHtml;
  const { html, text } = sanitizeResponseHtml(source, id);
  return {
    id,
    role: "assistant",
    html,
    text,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/outline",
      sourceConversationId: "outline",
      sourceMessageId: id,
      extractedAt: "2026-07-14T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(...responses: DocumentContentBlock[]): ConversationDocument {
  return {
    id: "chatgpt-outline",
    source: "chatgpt",
    title: null,
    sourceUrl: "https://chatgpt.com/c/outline",
    extractedAt: "2026-07-14T00:00:00.000Z",
    turns: responses.map((response, index) => ({
      id: `turn-${index}`,
      index,
      prompt: null,
      response,
    })),
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function openFocusMode(shadow: ShadowRoot): void {
  fireEvent.click(
    Array.from(shadow.querySelectorAll("button")).find((button) => button.textContent === "Focus")!,
  );
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  readonly unobserve = vi.fn();
  readonly takeRecords = vi.fn(() => []);
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
}

describe("active response outline", () => {
  it("renders one nested outline and scrolls the reader to a selected heading", async () => {
    const response = block(
      "outlined",
      "<h2>Overview</h2><p>Intro</p><h3>Details</h3><h2>Next steps</h2>",
    );
    await act(async () => mountReader(conversation(response), response));
    const shadow = shadowRoot();
    openFocusMode(shadow);
    const outline = shadow.querySelector<HTMLElement>(".rb-outline")!;
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    const detailsHeading = Array.from(shadow.querySelectorAll<HTMLElement>(".rb-content h3"))[0];
    const scrollTo = vi.fn();
    Object.defineProperties(scrollArea, {
      scrollTop: { configurable: true, value: 100, writable: true },
      scrollTo: { configurable: true, value: scrollTo },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ top: 10 }),
      },
    });
    Object.defineProperty(detailsHeading, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 210 }),
    });

    expect(outline.getAttribute("aria-label")).toBe("Current response outline");
    expect(outline.querySelectorAll(".rb-outline-link")).toHaveLength(3);
    expect(outline.querySelectorAll("ul ul .rb-outline-link")).toHaveLength(1);
    fireEvent.click(
      Array.from(outline.querySelectorAll("button")).find(
        (item) => item.textContent === "Details",
      )!,
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 284, behavior: "smooth" });
  });

  it("highlights the visible section and cleans observers while switching responses", async () => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    const first = block("first", "<h2>First heading</h2><h3>First detail</h3>");
    const second = block("second", "<h2>Second heading</h2><h3>Second detail</h3>");
    await act(async () => mountReader(conversation(first, second), second));
    const shadow = shadowRoot();
    FakeIntersectionObserver.instances = [];
    openFocusMode(shadow);
    fireEvent.click(shadow.querySelector('[aria-label="Show next assistant response"]')!);
    const observer = FakeIntersectionObserver.instances.at(-1)!;
    const detail = shadow.querySelector<HTMLElement>(".rb-content h3")!;

    act(() => {
      observer.callback(
        [
          {
            isIntersecting: true,
            target: detail,
            boundingClientRect: { top: 20 },
          } as unknown as IntersectionObserverEntry,
        ],
        observer as unknown as IntersectionObserver,
      );
    });
    expect(shadow.querySelector('[aria-current="location"]')?.textContent).toBe("Second detail");

    fireEvent.click(shadow.querySelector('[aria-label="Close response outline"]')!);
    fireEvent.click(shadow.querySelector('[aria-label="Open response outline"]')!);
    expect(shadow.querySelector('[aria-current="location"]')?.textContent).toBe("Second heading");
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(FakeIntersectionObserver.instances).toHaveLength(3);

    fireEvent.click(shadow.querySelector('[aria-label="Show previous assistant response"]')!);
    await vi.waitFor(() => expect(shadow.querySelectorAll(".rb-outline-link")).toHaveLength(2));
    expect(shadow.querySelector('[aria-current="location"]')?.textContent).toBe("First heading");
    expect(FakeIntersectionObserver.instances[2].disconnect).toHaveBeenCalledOnce();
    expect(FakeIntersectionObserver.instances).toHaveLength(4);
  });

  it("resets the active heading when the heading collection changes", () => {
    const initial = block("stable-response", "<h2>Initial heading</h2><h3>Initial detail</h3>");
    const updated = block("stable-response", "<h2>Updated heading</h2><h3>Updated detail</h3>");
    const scrollArea = document.createElement("main");
    scrollArea.innerHTML = `<article class="rb-content">${initial.html}</article>`;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });
    document.body.append(scrollArea);
    const scrollAreaRef = { current: scrollArea };
    const view = render(
      <ResponseOutline response={initial} scrollAreaRef={scrollAreaRef} open={true} />,
    );

    fireEvent.click(view.getByRole("button", { name: "Initial detail" }));
    expect(view.container.querySelector('[aria-current="location"]')?.textContent).toBe(
      "Initial detail",
    );

    scrollArea.innerHTML = `<article class="rb-content">${updated.html}</article>`;
    view.rerender(<ResponseOutline response={updated} scrollAreaRef={scrollAreaRef} open={true} />);
    expect(view.container.querySelector('[aria-current="location"]')?.textContent).toBe(
      "Updated heading",
    );
  });

  it("shows a concise empty state and supports opening and closing from the keyboard control", async () => {
    const response = block("plain", "<p>No semantic headings here.</p>");
    await act(async () => mountReader(conversation(response), response));
    const shadow = shadowRoot();
    openFocusMode(shadow);
    const toggle = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Close response outline"]',
    )!;

    expect(shadow.querySelector(".rb-outline-empty")?.textContent).toBe(
      "No headings in this response.",
    );
    toggle.focus();
    fireEvent.click(toggle, { detail: 0 });
    expect(shadow.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(shadow.querySelector(".rb-outline")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(toggle, { detail: 0 });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("starts collapsed at narrow widths", async () => {
    vi.stubGlobal("matchMedia", undefined);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        media: "(max-width: 900px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    const response = block("narrow", "<h2>Narrow heading</h2>");
    await act(async () => mountReader(conversation(response), response));
    const shadow = shadowRoot();
    openFocusMode(shadow);

    expect(shadow.querySelector(".rb-reader-body")?.getAttribute("data-narrow")).toBe("true");
    expect(
      shadow.querySelector('[aria-label="Open response outline"]')?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(shadow.querySelector(".rb-outline")?.hasAttribute("hidden")).toBe(true);
  });

  it("does not replace enhanced table DOM when outline state changes", async () => {
    const response = block(
      "table-outline",
      "<h2>Table section</h2><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
    );
    await act(async () => mountReader(conversation(response), response));
    const shadow = shadowRoot();
    openFocusMode(shadow);
    const tableBlock = shadow.querySelector<HTMLElement>(".rb-table-block")!;
    const toolbar = shadow.querySelector<HTMLElement>(".rb-block-toolbar")!;
    fireEvent.click(shadow.querySelector('[aria-label="Toggle compact text for table 1"]')!);

    fireEvent.click(shadow.querySelector('[aria-label="Close response outline"]')!);
    fireEvent.click(shadow.querySelector('[aria-label="Open response outline"]')!);

    expect(shadow.querySelector(".rb-table-block")).toBe(tableBlock);
    expect(shadow.querySelector(".rb-block-toolbar")).toBe(toolbar);
    expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(1);
    expect(tableBlock.dataset.density).toBe("compact");
  });
});
