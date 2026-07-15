import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function block(id: string, role: "user" | "assistant", sourceHtml: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = sourceHtml;
  const { html, text } = sanitizeResponseHtml(source, id);
  return {
    id,
    role,
    html,
    text,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/document-mode",
      extractedAt: "2026-07-15T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function fixture(includeTables = false): ConversationDocument {
  const table = includeTables
    ? "<table><tr><th>Name</th><th>Value</th></tr><tr><td>Mode</td><td>Stable</td></tr></table>"
    : "";
  return {
    id: "document-mode",
    source: "chatgpt",
    title: "A calm conversation",
    sourceUrl: "https://chatgpt.com/c/document-mode",
    extractedAt: "2026-07-15T00:00:00.000Z",
    turns: [
      {
        id: "turn-one",
        index: 0,
        prompt: block("prompt-one", "user", "<p>First private prompt</p>"),
        response: block(
          "response-one",
          "assistant",
          `<h2>First section</h2><p>First answer</p>${table}`,
        ),
      },
      {
        id: "turn-two",
        index: 1,
        prompt: block("prompt-two", "user", "<p>Second private prompt</p>"),
        response: block(
          "response-two",
          "assistant",
          `<p>Second answer without heading</p>${table}`,
        ),
      },
      {
        id: "turn-three",
        index: 2,
        prompt: null,
        response: block("response-three", "assistant", "<h3>Third section</h3><p>Third answer</p>"),
      },
      {
        id: "incomplete",
        index: 3,
        prompt: block("orphan-prompt", "user", "<p>Ignored prompt</p>"),
        response: null,
      },
    ],
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function modeButton(shadow: ShadowRoot, label: "Document" | "Focus"): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>(".rb-mode-switch button")).find(
    (button) => button.textContent === label,
  )!;
}

describe("minimal continuous document mode", () => {
  it("starts in Document mode and renders every eligible response exactly once", async () => {
    await act(async () => mountReader(fixture()));
    const shadow = shadowRoot();
    const sections = shadow.querySelectorAll<HTMLElement>(".rb-document-section");

    expect(modeButton(shadow, "Document").getAttribute("aria-pressed")).toBe("true");
    expect(shadow.querySelector("#rb-reader-title")?.textContent).toBe("A calm conversation");
    expect(sections).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-content--document")).toHaveLength(3);
    expect(shadow.textContent?.match(/First answer/g)).toHaveLength(1);
    expect(shadow.textContent?.match(/Second answer without heading/g)).toHaveLength(1);
    expect(shadow.textContent).not.toContain("Ignored prompt");
    expect(
      shadow.querySelector(".rb-content--document")?.classList.contains("rb-content--focus"),
    ).toBe(false);
    expect(shadow.querySelectorAll(".rb-response-navigation")).toHaveLength(0);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(3);
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("Third section");
    expect(
      Array.from(shadow.querySelectorAll(".rb-section-indicator"), (item) => item.textContent),
    ).toEqual(["Section 1", "Section 2", "Section 3"]);
    expect(shadow.textContent).not.toMatch(/Turn \d/);
  });

  it("uses the persisted beginning preference only when the reader initially opens", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            readerPreferences: {
              appearance: "system",
              textSize: "medium",
              spacing: "comfortable",
              preset: "comfortable",
              codeAppearance: "color",
              documentOpenAt: "beginning",
            },
          }),
          set: vi.fn(),
        },
      },
    });
    await act(async () => mountReader(fixture()));
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("First section");

    scrollArea.scrollTop = 321;
    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Reading settings",
      )!,
    );
    fireEvent.change(shadow.querySelector('[aria-label="Reader appearance"]')!, {
      target: { value: "dark" },
    });
    expect(scrollArea.scrollTop).toBe(321);
  });

  it("keeps prompts collapsed and lets disclosures expand independently", async () => {
    await act(async () => mountReader(fixture()));
    const shadow = shadowRoot();
    const prompts = Array.from(
      shadow.querySelectorAll<HTMLDetailsElement>(".rb-prompt-disclosure"),
    );

    expect(prompts).toHaveLength(2);
    expect(prompts.every((prompt) => !prompt.open)).toBe(true);
    fireEvent.click(prompts[0].querySelector("summary")!);
    expect(prompts[0].open).toBe(true);
    expect(prompts[1].open).toBe(false);
    expect(shadow.querySelectorAll(".rb-document-section")[2].querySelector("details")).toBeNull();
  });

  it("switches to the active document response and restores document scroll position", async () => {
    await act(async () => mountReader(fixture()));
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });
    scrollArea.scrollTop = 240;
    const secondGroup = Array.from(
      shadow.querySelectorAll<HTMLButtonElement>(".rb-outline-group-link"),
    )[1];
    fireEvent.click(secondGroup);
    scrollArea.scrollTop = 240;

    fireEvent.click(modeButton(shadow, "Focus"));
    expect(shadow.querySelector(".rb-content--focus")?.textContent).toContain(
      "Second answer without heading",
    );
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 2 of 3");
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(0);

    fireEvent.click(modeButton(shadow, "Document"));
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(3);
    expect(shadow.querySelector<HTMLElement>(".rb-scroll-area")?.scrollTop).toBe(240);
  });

  it("shares response-specific table state across modes without duplicate wrappers", async () => {
    await act(async () => mountReader(fixture(true)));
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });
    const compactButtons = shadow.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Toggle compact text for table 1"]',
    );
    const fullscreenButtons = shadow.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Open table 1 fullscreen"]',
    );
    expect(compactButtons).toHaveLength(2);
    fireEvent.click(fullscreenButtons[0]);
    fireEvent.click(fullscreenButtons[1]);
    expect(shadow.querySelectorAll('[data-rb-table-fullscreen="true"]')).toHaveLength(1);
    expect(
      fullscreenButtons[0].closest(".rb-table-block")?.hasAttribute("data-rb-table-fullscreen"),
    ).toBe(false);
    fireEvent.click(shadow.querySelector('[aria-label="Close fullscreen table 1"]:not([hidden])')!);
    expect(shadow.activeElement).toBe(fullscreenButtons[1]);
    fireEvent.click(compactButtons[1]);
    fireEvent.click(shadow.querySelectorAll<HTMLButtonElement>(".rb-outline-group-link")[1]);

    fireEvent.click(modeButton(shadow, "Focus"));
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.querySelector<HTMLElement>(".rb-table-block")?.dataset.density).toBe("compact");

    fireEvent.click(modeButton(shadow, "Document"));
    const blocks = shadow.querySelectorAll<HTMLElement>(".rb-table-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].dataset.density).toBe("normal");
    expect(blocks[1].dataset.density).toBe("compact");
    expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(2);
  });

  it("uses mode-specific copy and print operations without changing live state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);
    await act(async () => mountReader(fixture()));
    const shadow = shadowRoot();
    const firstPrompt = shadow.querySelector<HTMLDetailsElement>(".rb-prompt-disclosure")!;
    fireEvent.click(firstPrompt.querySelector("summary")!);
    fireEvent.click(
      Array.from(shadow.querySelectorAll("button")).find(
        (button) => button.textContent === "Actions",
      )!,
    );

    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    const documentCopy = String(writeText.mock.calls[0][0]);
    expect(documentCopy).toContain("First section\n\nFirst section\n\nFirst answer");
    expect(documentCopy).toContain("Second private prompt\n\nSecond answer without heading");
    expect(documentCopy).not.toContain("First private prompt");
    expect(documentCopy).not.toMatch(/\bTurn \d/);
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();
    expect(firstPrompt.open).toBe(true);
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(3);

    fireEvent.click(modeButton(shadow, "Focus"));
    fireEvent.click(
      Array.from(shadow.querySelectorAll("button")).find(
        (button) => button.textContent === "Actions",
      )!,
    );
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy focused response"]')!);
      await Promise.resolve();
    });
    expect(writeText.mock.calls[1][0]).toBe(fixture().turns[2].response?.text);
    fireEvent.click(shadow.querySelector('[aria-label="Print focused response"]')!);
    expect(print).toHaveBeenCalledTimes(2);
  });
});
