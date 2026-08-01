import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

const READER_CSS = readFileSync("src/reader/reader.css", "utf8");

function block(id: string, role: "user" | "assistant", html: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = html;
  const sanitized = sanitizeResponseHtml(source, id);
  return {
    id,
    role,
    ...sanitized,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/header",
      extractedAt: "2026-07-15T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(): ConversationDocument {
  return {
    id: "header-conversation",
    source: "chatgpt",
    title: "Header fixture",
    sourceUrl: "https://chatgpt.com/c/header",
    extractedAt: "2026-07-15T00:00:00.000Z",
    turns: [
      {
        id: "header-turn",
        index: 0,
        prompt: block("header-prompt", "user", "<p>Keep this disclosure open.</p>"),
        response: block(
          "header-response",
          "assistant",
          "<h2>Stable response</h2><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
        ),
      },
    ],
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function button(shadow: ShadowRoot, label: string): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  )!;
}

describe("reader header refinement", () => {
  it("shows the package version and keeps mode, outline, and close directly accessible", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const primary = shadow.querySelector(".rb-toolbar-primary")!;

    expect(shadow.querySelector(".rb-version-label")?.textContent).toBe("Beta · v0.7.4");
    expect(primary.contains(button(shadow, "Document"))).toBe(true);
    expect(primary.contains(button(shadow, "Focus"))).toBe(true);
    expect(primary.contains(button(shadow, "Hide outline"))).toBe(true);
    expect(primary.contains(button(shadow, "Close"))).toBe(true);
    expect(shadow.querySelector(".rb-toolbar-secondary")).toBeNull();

    fireEvent.click(button(shadow, "Focus"));
    const secondary = shadow.querySelector(".rb-toolbar-secondary")!;
    expect(secondary.querySelector(".rb-response-navigation")).not.toBeNull();
    expect(
      secondary.querySelector<HTMLButtonElement>('[aria-label="Show previous assistant response"]')
        ?.disabled,
    ).toBe(true);
    expect(READER_CSS).toMatch(
      /@media \(max-width: 1050px\)[\s\S]+\.rb-toolbar-primary[\s\S]+grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(READER_CSS).toMatch(
      /@media \(max-width: 620px\)[\s\S]+\.rb-header-controls[\s\S]+grid-template-columns: repeat\(2/,
    );
  });

  it("opens one panel at a time, persists settings, and preserves response DOM state", async () => {
    const storageSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(), set: storageSet } } });
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const settingsTrigger = button(shadow, "Reading settings");
    const actionsTrigger = button(shadow, "Actions");
    const content = shadow.querySelector(".rb-content")!;
    const tableBlock = shadow.querySelector(".rb-table-block")!;
    const prompt = shadow.querySelector<HTMLDetailsElement>(".rb-prompt-disclosure")!;
    fireEvent.click(prompt.querySelector("summary")!);
    fireEvent.click(shadow.querySelector('[aria-label="Use wide mode for table 1"]')!);

    fireEvent.click(settingsTrigger);
    expect(settingsTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(shadow.querySelector("#rb-reading-settings-panel")).not.toBeNull();
    expect(shadow.activeElement).toBe(
      shadow.querySelector<HTMLSelectElement>('[aria-label="Reading style"]'),
    );
    fireEvent.change(shadow.querySelector('[aria-label="Reader appearance"]')!, {
      target: { value: "dark" },
    });
    fireEvent.change(shadow.querySelector('[aria-label="Reading style"]')!, {
      target: { value: "fast-reading" },
    });
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalled());
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-appearance")).toBe("dark");
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-reading-style")).toBe(
      "fast-reading",
    );
    expect(
      shadow.querySelector<HTMLSelectElement>('[aria-label="Reading style"]')?.selectedOptions[0]
        .textContent,
    ).toBe("Fast Reading");
    expect(shadow.querySelector("#rb-fast-reading-description")?.textContent).toBe(
      "Uses fixation-guided letter emphasis to support faster scanning.",
    );

    fireEvent.click(actionsTrigger);
    expect(shadow.querySelector("#rb-reading-settings-panel")).toBeNull();
    expect(shadow.querySelectorAll(".rb-header-panel")).toHaveLength(1);
    expect(shadow.querySelector("#rb-actions-panel")).not.toBeNull();
    expect(shadow.activeElement).toBe(
      shadow.querySelector<HTMLButtonElement>('[aria-label="Copy conversation document"]'),
    );
    expect(shadow.querySelector(".rb-content")).toBe(content);
    expect(shadow.querySelector(".rb-table-block")).toBe(tableBlock);
    expect((shadow.querySelector(".rb-table-block") as HTMLElement).dataset.mode).toBe("wide");
    expect(prompt.open).toBe(true);

    fireEvent.click(settingsTrigger);
    fireEvent.change(shadow.querySelector('[aria-label="Code appearance"]')!, {
      target: { value: "plain" },
    });
    fireEvent.change(shadow.querySelector('[aria-label="Open document at"]')!, {
      target: { value: "beginning" },
    });
    await vi.waitFor(() =>
      expect(storageSet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          readerPreferences: expect.objectContaining({
            codeAppearance: "plain",
            documentOpenAt: "beginning",
            readingFont: "fast-reading",
          }),
        }),
      ),
    );
  });

  it("closes panels before the reader and restores focus after Escape and outside clicks", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const actionsTrigger = button(shadow, "Actions");
    const settingsTrigger = button(shadow, "Reading settings");

    fireEvent.click(actionsTrigger);
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
    });
    expect(document.getElementById(READER_HOST_ID)).not.toBeNull();
    expect(shadow.querySelector(".rb-header-panel")).toBeNull();
    expect(shadow.activeElement).toBe(actionsTrigger);

    fireEvent.click(settingsTrigger);
    await act(async () => {
      fireEvent.click(shadow.querySelector(".rb-document-section")!);
      await Promise.resolve();
    });
    expect(shadow.querySelector(".rb-header-panel")).toBeNull();
    expect(shadow.activeElement).toBe(settingsTrigger);

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
    });
    expect(document.getElementById(READER_HOST_ID)).toBeNull();
  });

  it("keeps Copy and Print in Actions and exposes concise local-only About information", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    fireEvent.click(button(shadow, "Actions"));

    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    fireEvent.click(button(shadow, "About ReadBooster"));

    expect(writeText).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(shadow.querySelector("#rb-about-readbooster")?.textContent).toContain(
      "Version 0.7.4 Beta",
    );
    expect(shadow.querySelector("#rb-about-readbooster")?.textContent).toContain(
      "ReadBooster processes content locally in your browser.",
    );
    expect(shadow.querySelector("#rb-about-readbooster")?.textContent).toContain(
      "ReadBooster currently supports ChatGPT, Google Gemini, Mistral, and Claude.",
    );
    expect(shadow.querySelector("#rb-about-readbooster")?.textContent).toContain(
      "Gemini, Mistral, and Claude live full-checklist verification remain pending.",
    );
    expect(shadow.querySelector("#rb-about-readbooster")?.textContent).not.toContain(
      "Claude support is planned",
    );
  });
});
