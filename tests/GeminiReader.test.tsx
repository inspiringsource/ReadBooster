import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GeminiAdapter } from "../src/content/adapters/GeminiAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { SECTION_TITLE_OVERRIDES_STORAGE_KEY } from "../src/shared/sectionTitleOverrides";

const FIXTURE = readFileSync("tests/fixtures/gemini-conversation.html", "utf8");

function conversation() {
  const doc = new DOMParser().parseFromString(FIXTURE, "text/html");
  doc.title = "Gemini reader fixture - Google Gemini";
  return new GeminiAdapter(
    doc,
    "gemini.google.com",
    "https://gemini.google.com/app/fixture-reader",
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
});
