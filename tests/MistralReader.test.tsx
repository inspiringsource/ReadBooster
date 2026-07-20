import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MistralAdapter } from "../src/content/adapters/MistralAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { SECTION_TITLE_OVERRIDES_STORAGE_KEY } from "../src/shared/sectionTitleOverrides";

const FIXTURE = readFileSync("tests/fixtures/mistral-conversation.html", "utf8");

function conversation() {
  const doc = new DOMParser().parseFromString(FIXTURE, "text/html");
  doc.title = "Mistral reader fixture - Mistral";
  return new MistralAdapter(
    doc,
    "chat.mistral.ai",
    "https://chat.mistral.ai/work/fixture-reader",
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

describe("Mistral reader integration", () => {
  it("uses the shared Document, Focus, outline, prompt, table, code, image, and feedback UI", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();

    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-mode")).toBe("document");
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(4);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(4);
    expect(shadow.querySelectorAll(".rb-prompt-disclosure")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(2);
    expect(
      Array.from(shadow.querySelectorAll(".rb-code-language"), (label) => label.textContent),
    ).toEqual(["Python", "TypeScript"]);
    expect(shadow.querySelectorAll("figure img")).toHaveLength(1);
    expect(shadow.querySelector("figure img")?.getAttribute("alt")).toBe(
      "Generated Mistral diagram",
    );

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
    expect(shadow.querySelector(".rb-content")?.textContent).toContain(
      "This response has no mounted prompt.",
    );
  });

  it("reuses exact code Copy, table state, Document Copy, Print, and refresh merging", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);
    const source = conversation();
    const refresh = vi.fn().mockResolvedValue({
      document: source,
      scanPerformed: false,
      completed: false,
      terminationReason: "single-snapshot",
    });
    await act(async () => mountReader(source, undefined, refresh));
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();
    const originalTable = shadow.querySelector<HTMLElement>(".rb-table-block")!;
    const originalImage = shadow.querySelector("figure img");

    expect(refresh).toHaveBeenCalledOnce();
    fireEvent.click(shadow.querySelector('[aria-label="Use wide mode for table 1"]')!);
    expect(originalTable.dataset.mode).toBe("wide");
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
    const copied = String(writeText.mock.calls.at(-1)?.[0]);
    expect(copied).toContain("Mistral overview");
    expect(copied).toContain("Currently available partial response.");
    expect(copied).toContain("Generated Mistral diagram");
    expect(copied).not.toContain("Fixture prompt about a structured response.");
    expect(copied).not.toContain("generated-image.png");
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();

    fireEvent.click(button(shadow, "Refresh conversation"));
    await act(async () => Promise.resolve());
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(4);
    expect(shadow.querySelectorAll("figure img")).toHaveLength(1);
    expect(shadow.querySelector("figure img")).toBe(originalImage);
    expect(shadow.querySelector(".rb-table-block")).toBe(originalTable);
    expect(originalTable.dataset.mode).toBe("wide");
  });

  it("persists renamed sections under Mistral conversation and response identities", async () => {
    const values: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: values[key] })),
          set: vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update)),
        },
      },
    });
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    fireEvent.click(shadow.querySelector('[aria-label="Rename section “Mistral overview”"]')!);
    const input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    fireEvent.change(input, { target: { value: "Mistral custom section" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });

    expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
      "Mistral custom section",
    );
    const payload = JSON.stringify(values[SECTION_TITLE_OVERRIDES_STORAGE_KEY]);
    expect(payload).toContain("mistral:fixture-reader");
    expect(payload).toContain("mistral:mistral-assistant-1");
    expect(payload).not.toContain("semantic response");
    expect(payload).not.toContain("Fixture prompt");
  });
});
