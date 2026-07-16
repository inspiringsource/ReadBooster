import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GeminiAdapter } from "../src/content/adapters/GeminiAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { SECTION_TITLE_OVERRIDES_STORAGE_KEY } from "../src/shared/sectionTitleOverrides";

const FIXTURE = readFileSync("tests/fixtures/gemini-conversation.html", "utf8");
const BUTTON_IMAGE_FIXTURE = readFileSync("tests/fixtures/gemini-button-image.html", "utf8");
const PRINT_CSS = readFileSync("src/reader/reader.print.css", "utf8");

function conversation() {
  const doc = new DOMParser().parseFromString(FIXTURE, "text/html");
  doc.title = "Gemini reader fixture - Google Gemini";
  return new GeminiAdapter(
    doc,
    "gemini.google.com",
    "https://gemini.google.com/app/fixture-reader",
  ).getConversationDocument()!;
}

function imageConversation() {
  const doc = new DOMParser().parseFromString(BUTTON_IMAGE_FIXTURE, "text/html");
  return new GeminiAdapter(
    doc,
    "gemini.google.com",
    "https://gemini.google.com/app/fixture-image-reader",
  ).getConversationDocument()!;
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function button(shadow: ShadowRoot, label: string): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  )!;
}

describe("Gemini reader integration", () => {
  it("uses the existing Document, Focus, outline, prompt, code, table, and feedback UI", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();

    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-mode")).toBe("document");
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(4);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(4);
    expect(shadow.querySelectorAll(".rb-prompt-disclosure")).toHaveLength(3);
    expect(
      Array.from(shadow.querySelectorAll<HTMLDetailsElement>(".rb-prompt-disclosure")).every(
        (details) => !details.open,
      ),
    ).toBe(true);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(4);
    expect(
      Array.from(shadow.querySelectorAll(".rb-code-language"), (label) => label.textContent),
    ).toEqual(["Python", "JavaScript", "JSON", "Code"]);
    expect(shadow.querySelectorAll("figure")).toHaveLength(1);

    fireEvent.click(button(shadow, "Actions"));
    fireEvent.click(shadow.querySelector('[aria-label="Send feedback"]')!);
    expect(shadow.querySelector<HTMLIFrameElement>(".rb-feedback-frame")?.src).toBe(
      "https://tally.so/r/QKWqjp",
    );
    expect(shadow.querySelector(".rb-feedback-frame")?.getAttribute("src")).not.toContain(
      "fixture-reader",
    );
    fireEvent.click(shadow.querySelector('[aria-label="Close feedback form"]')!);
    await act(async () => Promise.resolve());

    fireEvent.click(button(shadow, "Focus"));
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Response 4 of 4");
    fireEvent.click(shadow.querySelector('[aria-label="Show previous assistant response"]')!);
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Response 3 of 4");
    expect(shadow.querySelector(".rb-content")?.textContent).toContain("Assistant-only result");
  });

  it("reuses exact code Copy, table state, Document Copy, and Print behavior", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const table = shadow.querySelector<HTMLElement>(".rb-table-block")!;

    fireEvent.click(shadow.querySelector('[aria-label="Use wide mode for table 1"]')!);
    expect(table.dataset.mode).toBe("wide");
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy python code block 1"]')!);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenLastCalledWith("def answer():\n    return 42");

    fireEvent.click(button(shadow, "Actions"));
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    const documentCopy = String(writeText.mock.calls.at(-1)?.[0]);
    expect(documentCopy).toContain("Semantic overview");
    expect(documentCopy).toContain("Currently available partial response.");
    expect(documentCopy).not.toContain("Fixture prompt about semantic content.");
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();
    expect(table.dataset.mode).toBe("wide");
  });

  it("persists a custom title only by stable Gemini conversation and response identity", async () => {
    const values: Record<string, unknown> = {};
    const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update));
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: values[key] })),
          set,
        },
      },
    });
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    fireEvent.click(shadow.querySelector('[aria-label="Rename section “Semantic overview”"]')!);
    const input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    fireEvent.change(input, { target: { value: "Gemini custom section" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });

    expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
      "Gemini custom section",
    );
    const payload = JSON.stringify(values[SECTION_TITLE_OVERRIDES_STORAGE_KEY]);
    expect(payload).toContain("gemini:fixture-gemini-conversation");
    expect(payload).toContain("gemini:gemini-response-1");
    expect(payload).not.toContain("Gemini response with");
    expect(payload).not.toContain("Fixture prompt");
  });

  it("renders the normalized hero image once across Document, Focus, Copy, and Print", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    await act(async () => mountReader(imageConversation()));
    const shadow = shadowRoot();

    expect(shadow.querySelectorAll(".rb-document-section figure img")).toHaveLength(1);
    expect(shadow.querySelector("figure img")?.getAttribute("alt")).toBe(
      "The Federal Palace in Bern, AI generated",
    );
    fireEvent.click(button(shadow, "Actions"));
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    const copied = String(writeText.mock.calls.at(-1)?.[0]);
    expect(copied).toContain("The Federal Palace in Bern, AI generated");
    expect(copied).not.toContain("encrypted-tbn1.gstatic.com");
    expect(PRINT_CSS).toMatch(/\.rb-content figure img[\s\S]+max-width: 100% !important/);

    fireEvent.click(button(shadow, "Focus"));
    expect(shadow.querySelectorAll(".rb-content--focus figure img")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-reader figure img")).toHaveLength(1);
    fireEvent.click(button(shadow, "Document"));
    expect(shadow.querySelectorAll(".rb-document-section figure img")).toHaveLength(1);
  });

  it("keeps the hero image stable through refresh merging and section renaming", async () => {
    const values: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: values[key] })),
          set: vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update)),
        },
      },
    });
    const source = imageConversation();
    const refresh = vi.fn().mockResolvedValue({
      document: source,
      scanPerformed: false,
      completed: false,
      terminationReason: "single-snapshot",
    });
    await act(async () => mountReader(source, undefined, refresh));
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();
    const originalFigure = shadow.querySelector(".rb-document-section figure");

    expect(refresh).toHaveBeenCalledOnce();
    expect(shadow.querySelectorAll(".rb-document-section figure")).toHaveLength(1);
    fireEvent.click(button(shadow, "Actions"));
    fireEvent.click(button(shadow, "Refresh conversation"));
    await act(async () => Promise.resolve());
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(shadow.querySelectorAll(".rb-document-section figure")).toHaveLength(1);
    expect(shadow.querySelector(".rb-document-section figure")).toBe(originalFigure);

    fireEvent.click(
      shadow.querySelector('[aria-label="Rename section “Fixture prompt for a response image.”"]')!,
    );
    const input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    fireEvent.change(input, { target: { value: "Federal Palace image" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });
    expect(shadow.querySelector(".rb-document-section figure")).toBe(originalFigure);
    expect(shadow.querySelectorAll(".rb-document-section figure img")).toHaveLength(1);
    expect(JSON.stringify(values)).not.toContain("encrypted-tbn1.gstatic.com");
    expect(JSON.stringify(values)).not.toContain("redacted-fixture");
  });
});
