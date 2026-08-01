import { act, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function block(id: string, html: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = html;
  return {
    id,
    role: "assistant",
    ...sanitizeResponseHtml(source, id),
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/guided-reading",
      sourceConversationId: "guided-reading",
      sourceMessageId: id,
      extractedAt: "2026-08-01T08:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(): ConversationDocument {
  return {
    id: "guided-reading",
    source: "chatgpt",
    title: "Guided Reading fixture",
    sourceUrl: "https://chatgpt.com/c/guided-reading",
    extractedAt: "2026-08-01T08:00:00.000Z",
    turns: [
      {
        id: "turn-one",
        index: 0,
        prompt: null,
        response: block(
          "guided-response-one",
          "<h2>First response</h2><p>Opening paragraph.</p><ul><li>First item</li><li>Second item</li></ul><pre><code>const guided = true;</code></pre>",
        ),
      },
      {
        id: "turn-two",
        index: 1,
        prompt: null,
        response: block(
          "guided-response-two",
          '<h2>Second response</h2><p>Closing paragraph.</p><figure><img src="diagram.png" alt="Diagram"><figcaption>Diagram caption</figcaption></figure>',
        ),
      },
    ],
  };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update));
  vi.stubGlobal("chrome", {
    storage: { local: { get, set } },
    runtime: { getURL: (path: string) => path },
  });
  return { values, get, set };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function button(shadow: ShadowRoot, text: string): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === text,
  )!;
}

async function enableGuidedReading(shadow: ShadowRoot, value: "soft" | "focused" = "soft") {
  fireEvent.click(button(shadow, "Reading settings"));
  fireEvent.change(shadow.querySelector('[aria-label="Reading assistance"]')!, {
    target: { value },
  });
  await waitFor(() =>
    expect(shadow.querySelectorAll(".rb-reading-block").length).toBeGreaterThan(0),
  );
}

describe("Guided Reading Reader integration", () => {
  it("persists the preference, follows the focus zone, and navigates without duplicate blocks", async () => {
    const extensionStorage = storage();
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const reader = shadow.querySelector<HTMLElement>(".rb-reader")!;
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });

    await enableGuidedReading(shadow, "focused");
    expect(reader.dataset.guidedReading).toBe("focused");
    await waitFor(() =>
      expect(extensionStorage.set).toHaveBeenCalledWith(
        expect.objectContaining({
          readerPreferences: expect.objectContaining({ guidedReading: "focused" }),
        }),
      ),
    );

    const blocks = Array.from(shadow.querySelectorAll<HTMLElement>(".rb-reading-block"));
    expect(blocks).toHaveLength(7);
    expect(blocks.filter((block) => block.dataset.rbGuidedState === "active")).toHaveLength(1);
    vi.spyOn(scrollArea, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 1000,
      height: 1000,
      left: 0,
      right: 800,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    blocks.forEach((block, index) =>
      vi.spyOn(block, "getBoundingClientRect").mockReturnValue({
        top: index * 180,
        bottom: index * 180 + 120,
        height: 120,
        left: 0,
        right: 700,
        width: 700,
        x: 0,
        y: index * 180,
        toJSON: () => ({}),
      }),
    );
    fireEvent.scroll(scrollArea);
    await waitFor(() => expect(blocks[2].dataset.rbGuidedState).toBe("active"));

    fireEvent.click(shadow.querySelector('[aria-label="Next passage"]')!);
    expect(blocks[3].dataset.rbGuidedState).toBe("active");
    expect(scrollArea.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: expect.stringMatching(/auto|smooth/) }),
    );
    expect(shadow.activeElement).toBe(blocks[3]);

    fireEvent.keyDown(blocks[3], { key: "k" });
    expect(blocks[2].dataset.rbGuidedState).toBe("active");
    fireEvent.keyDown(blocks[2], { key: "ArrowDown" });
    expect(blocks[3].dataset.rbGuidedState).toBe("active");

    fireEvent.click(button(shadow, "Reading settings"));
    const assistance = shadow.querySelector<HTMLSelectElement>(
      '[aria-label="Reading assistance"]',
    )!;
    const activeBeforeInputKey = blocks.findIndex(
      (block) => block.dataset.rbGuidedState === "active",
    );
    fireEvent.keyDown(assistance, { key: "j" });
    expect(blocks.findIndex((block) => block.dataset.rbGuidedState === "active")).toBe(
      activeBeforeInputKey,
    );

    fireEvent.click(button(shadow, "Focus"));
    await waitFor(() => expect(shadow.querySelectorAll(".rb-content--focus")).toHaveLength(1));
    await waitFor(() =>
      expect(
        shadow.querySelectorAll(".rb-content--focus .rb-reading-block").length,
      ).toBeGreaterThan(0),
    );
    expect(shadow.querySelectorAll("[data-rb-reading-block-id]").length).toBe(
      new Set(
        Array.from(
          shadow.querySelectorAll<HTMLElement>("[data-rb-reading-block-id]"),
          (element) => element.dataset.rbReadingBlockId,
        ),
      ).size,
    );
  });

  it("suspends for Print Studio, restores after closing it, and cleans up when disabled", async () => {
    storage();
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    await enableGuidedReading(shadow);

    fireEvent.click(button(shadow, "Actions"));
    fireEvent.click(button(shadow, "Print Studio"));
    await waitFor(() => expect(shadow.querySelector(".rb-print-studio")).not.toBeNull());
    await waitFor(() => expect(shadow.querySelectorAll(".rb-reading-block")).toHaveLength(0));
    expect(shadow.querySelector(".rb-print-page [data-rb-guided-state]")).toBeNull();

    fireEvent.click(button(shadow, "Back to Reader"));
    await waitFor(() =>
      expect(shadow.querySelectorAll(".rb-reading-block").length).toBeGreaterThan(0),
    );
    fireEvent.click(button(shadow, "Reading settings"));
    fireEvent.change(shadow.querySelector('[aria-label="Reading assistance"]')!, {
      target: { value: "off" },
    });
    await waitFor(() => expect(shadow.querySelectorAll(".rb-reading-block")).toHaveLength(0));
    expect(shadow.querySelector(".rb-guided-navigation")).toBeNull();
  });

  it("restores Guided Reading after reopening with older preferences remaining compatible", async () => {
    const extensionStorage = storage({
      readerPreferences: {
        appearance: "dark",
        textSize: "large",
        spacing: "roomy",
        readingFont: "dyslexia-friendly",
        codeAppearance: "plain",
        documentOpenAt: "beginning",
        guidedReading: "soft",
      },
    });
    await act(async () => mountReader(conversation()));
    await waitFor(() =>
      expect(shadowRoot().querySelectorAll(".rb-reading-block").length).toBeGreaterThan(0),
    );
    expect(shadowRoot().querySelector(".rb-reader")?.getAttribute("data-guided-reading")).toBe(
      "soft",
    );

    act(() => unmountReader());
    delete extensionStorage.values.readerPreferences;
    await act(async () => mountReader(conversation()));
    expect(shadowRoot().querySelector(".rb-reader")?.getAttribute("data-guided-reading")).toBe(
      "off",
    );
    expect(shadowRoot().querySelectorAll(".rb-reading-block")).toHaveLength(0);
  });
});
