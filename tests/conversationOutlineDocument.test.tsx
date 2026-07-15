import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function response(id: string, html: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = html;
  const sanitized = sanitizeResponseHtml(source, id);
  return {
    id,
    role: "assistant",
    ...sanitized,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/outline-document",
      extractedAt: "2026-07-15T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(): ConversationDocument {
  return {
    id: "outline-document",
    source: "chatgpt",
    title: null,
    sourceUrl: "https://chatgpt.com/c/outline-document",
    extractedAt: "2026-07-15T00:00:00.000Z",
    turns: [
      {
        id: "turn-first",
        index: 0,
        prompt: null,
        response: response("first", "<h2>First</h2><h3>First detail</h3>"),
      },
      {
        id: "turn-second",
        index: 1,
        prompt: null,
        response: response("second", "<h2>Second</h2><h3>Second detail</h3>"),
      },
    ],
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }
}

describe("grouped conversation outline", () => {
  it("keeps groups calm, independently expandable, and navigates groups and exact headings", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    const scrollTo = vi.fn();
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: scrollTo });

    const groups = shadow.querySelectorAll(".rb-outline-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelectorAll(".rb-outline-link")).toHaveLength(1);
    expect(groups[0].textContent).not.toContain("FirstFirst");
    expect(groups[1].querySelectorAll(".rb-outline-link")).toHaveLength(0);

    fireEvent.click(shadow.querySelector('[aria-label="Expand headings for Second"]')!);
    expect(groups[1].querySelector(".rb-outline-link")?.textContent).toBe("Second detail");
    fireEvent.click(shadow.querySelectorAll<HTMLButtonElement>(".rb-outline-group-link")[0]);
    expect(groups[1].querySelector(".rb-outline-link")?.textContent).toBe("Second detail");
    expect(scrollTo).toHaveBeenCalled();

    fireEvent.click(groups[1].querySelector<HTMLButtonElement>(".rb-outline-link")!);
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect(shadow.activeElement?.id).toBe(
      conversation().turns[1].response?.html.match(/<h3 id="([^"]+)/)?.[1],
    );
  });

  it("tracks the active response and heading with one observer and cleans up on Focus", async () => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const observer = FakeIntersectionObserver.instances[0];
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    const removeListener = vi.spyOn(scrollArea, "removeEventListener");
    const sections = shadow.querySelectorAll<HTMLElement>(".rb-document-section");
    const headings = shadow.querySelectorAll<HTMLElement>(".rb-content h2, .rb-content h3");
    Object.defineProperty(scrollArea, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0 }),
    });
    Object.defineProperty(sections[0], "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: -500 }),
    });
    Object.defineProperty(sections[1], "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 10 }),
    });
    headings.forEach((heading, index) =>
      Object.defineProperty(heading, "getBoundingClientRect", {
        configurable: true,
        value: () => ({ top: index < 2 ? -450 + index * 20 : 30 + (index - 2) * 30 }),
      }),
    );

    act(() => {
      observer.callback([], observer as unknown as IntersectionObserver);
    });
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("Second");
    expect(shadow.querySelector('.rb-outline-link[aria-current="location"]')?.textContent).toBe(
      "Second detail",
    );

    fireEvent.click(
      Array.from(shadow.querySelectorAll(".rb-mode-switch button")).find(
        (button) => button.textContent === "Focus",
      )!,
    );
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("closes the narrow conversation drawer after selecting a destination", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        media: "(max-width: 900px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });
    fireEvent.click(shadow.querySelector('[aria-label="Open conversation outline"]')!);
    expect(shadow.querySelector(".rb-outline")?.hasAttribute("hidden")).toBe(false);

    fireEvent.click(shadow.querySelector(".rb-outline-group-link")!);
    expect(shadow.querySelector(".rb-outline")?.hasAttribute("hidden")).toBe(true);
    expect(shadow.querySelector('[aria-label="Open conversation outline"]')).not.toBeNull();
    expect(shadow.activeElement?.classList.contains("rb-document-section")).toBe(true);
  });
});
