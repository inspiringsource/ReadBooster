import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import {
  SECTION_TITLE_OVERRIDES_STORAGE_KEY,
  sectionTitleOverrideIdentity,
} from "../src/shared/sectionTitleOverrides";
import type {
  ConversationDocument,
  ConversationScanResult,
  DocumentContentBlock,
} from "../src/shared/types";

const READER_CSS = readFileSync("src/reader/reader.css", "utf8");

function block(
  id: string,
  role: "user" | "assistant",
  html: string,
  conversationId = "rename-fixture",
): DocumentContentBlock {
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
      sourceUrl: `https://chatgpt.com/c/${conversationId}`,
      sourceConversationId: conversationId,
      sourceMessageId: id,
      extractedAt: "2026-07-16T15:00:00.000Z",
      contentFingerprint: `fingerprint-${id}-${sanitized.html}`,
    },
  };
}

function responseHtml(number: number, heading = `Automatic section ${number}`): string {
  const richContent =
    number === 2
      ? `<table><tr><th>Section</th><th>Value</th></tr><tr><td>Two</td><td>Stable</td></tr></table>
         <pre><code class="language-python">print("two")</code></pre>
         <figure><img src="data:image/png;base64,AAAA" alt="Chart two" width="640" height="320"><figcaption>Chart two</figcaption></figure>`
      : "";
  return `<h2>${heading}</h2><h3>Detail ${number}</h3><p>Original assistant body ${number}</p>${richContent}`;
}

function conversation(
  numbers: readonly number[] = [1, 2, 3],
  conversationId = "rename-fixture",
  headingOverrides: Readonly<Record<number, string>> = {},
): ConversationDocument {
  return {
    id: `chatgpt-${conversationId}`,
    source: "chatgpt",
    title: "Rename fixture",
    sourceUrl: `https://chatgpt.com/c/${conversationId}`,
    extractedAt: "2026-07-16T15:00:00.000Z",
    turns: numbers.map((number, index) => ({
      id: `turn-prompt-${number}-response-${number}`,
      index,
      prompt: block(`prompt-${number}`, "user", `<p>Original prompt ${number}</p>`, conversationId),
      response: block(
        `response-${number}`,
        "assistant",
        responseHtml(number, headingOverrides[number]),
        conversationId,
      ),
    })),
  };
}

function scanResult(document: ConversationDocument): ConversationScanResult {
  return {
    document,
    scanPerformed: true,
    completed: true,
    terminationReason: "bottom",
  };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => {
    Object.assign(values, update);
  });
  vi.stubGlobal("chrome", { storage: { local: { get, set } } });
  return { values, get, set };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function renameButton(shadow: ShadowRoot, title: string): HTMLButtonElement {
  return shadow.querySelector<HTMLButtonElement>(`[aria-label="Rename section “${title}”"]`)!;
}

async function saveTitle(
  shadow: ShadowRoot,
  currentTitle: string,
  customTitle: string,
  withEnter = true,
): Promise<void> {
  fireEvent.click(renameButton(shadow, currentTitle));
  const input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
  fireEvent.change(input, { target: { value: customTitle } });
  await act(async () => {
    if (withEnter) {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    } else {
      fireEvent.click(
        shadow.querySelector<HTMLButtonElement>(
          '[data-rb-section-title-editor] button[type="submit"]',
        )!,
      );
    }
    await Promise.resolve();
  });
  await vi.waitFor(() => expect(shadow.querySelector("[data-rb-section-title-editor]")).toBeNull());
}

describe("inline custom section titles", () => {
  it("renames with Enter and applies plain custom text to outline, document, Copy, and Print", async () => {
    const backend = storage();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const response = shadow.querySelector<HTMLElement>('[data-rb-response-id="response-2"]')!;
    const originalHeading = response.querySelector<HTMLElement>(".rb-content h2")!;
    const table = response.querySelector<HTMLElement>(".rb-table-block")!;
    const code = response.querySelector<HTMLElement>(".rb-code-block")!;
    const figure = response.querySelector<HTMLElement>("figure")!;
    const prompt = response.querySelector<HTMLDetailsElement>(".rb-prompt-disclosure")!;
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    scrollArea.scrollTop = 418;
    fireEvent.click(prompt.querySelector("summary")!);
    fireEvent.click(table.querySelector('[aria-label="Use wide mode for table 1"]')!);
    fireEvent.click(
      shadow.querySelector('[aria-label="Expand headings for Automatic section 2"]')!,
    );
    const activeBefore = shadow.querySelector('.rb-outline-group-link[aria-current="location"]');

    fireEvent.click(renameButton(shadow, "Automatic section 2"));
    expect(shadow.querySelector('.rb-outline-group-link[aria-current="location"]')).toBe(
      activeBefore,
    );
    const input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    expect(input.value).toBe("Automatic section 2");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    fireEvent.change(input, { target: { value: "  Rename\n   outline <b>sections</b>  " } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });

    await vi.waitFor(() =>
      expect(shadow.querySelector(".rb-section-title-status")?.textContent).toBe(
        "Section title renamed.",
      ),
    );
    const customTitle = "Rename outline <b>sections</b>";
    expect(shadow.querySelectorAll(".rb-outline-group-link")[1].textContent).toBe(customTitle);
    expect(shadow.querySelectorAll(".rb-document-section-header h2")[1].textContent).toBe(
      customTitle,
    );
    expect(shadow.querySelector(".rb-custom-title-indicator")?.getAttribute("aria-label")).toBe(
      "Custom title",
    );
    expect(
      shadow.querySelector('[aria-label="Collapse headings for Rename outline <b>sections</b>"]'),
    ).not.toBeNull();
    expect(originalHeading.textContent).toBe("Automatic section 2");
    expect(shadow.querySelector(".rb-content b")).toBeNull();
    expect(shadow.querySelector('[data-rb-response-id="response-2"]')).toBe(response);
    expect(response.querySelector(".rb-table-block")).toBe(table);
    expect(table.dataset.mode).toBe("wide");
    expect(response.querySelector(".rb-code-block")).toBe(code);
    expect(response.querySelector("figure")).toBe(figure);
    expect(prompt.open).toBe(true);
    expect(scrollArea.scrollTop).toBe(418);
    expect(shadow.activeElement).toBe(renameButton(shadow, customTitle));

    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent === "Actions",
      )!,
    );
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    expect(String(writeText.mock.calls[0][0])).toContain(customTitle);
    expect(String(writeText.mock.calls[0][0])).not.toContain("Original prompt 2");
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();
    expect(shadow.querySelectorAll(".rb-document-section-header h2")[1].textContent).toBe(
      customTitle,
    );

    const storedPayload = JSON.stringify(backend.values[SECTION_TITLE_OVERRIDES_STORAGE_KEY]);
    expect(storedPayload).toContain(customTitle);
    expect(storedPayload).not.toContain("Original assistant body");
    expect(storedPayload).not.toContain("Original prompt");
  });

  it("cancels with Escape or Cancel, rejects invalid input, and allows only one editor", async () => {
    storage();
    vi.stubGlobal("matchMedia", undefined);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();

    fireEvent.click(renameButton(shadow, "Automatic section 1"));
    let input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    fireEvent.change(input, { target: { value: "Discard this" } });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(document.getElementById(READER_HOST_ID)).not.toBeNull();
    await vi.waitFor(() =>
      expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
        "Automatic section 1",
      ),
    );
    expect(shadow.activeElement).toBe(renameButton(shadow, "Automatic section 1"));

    fireEvent.click(renameButton(shadow, "Automatic section 1"));
    fireEvent.click(renameButton(shadow, "Automatic section 2"));
    expect(shadow.querySelectorAll("[data-rb-section-title-editor]")).toHaveLength(1);
    input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    expect(input.value).toBe("Automatic section 2");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(shadow.querySelector('[data-rb-section-title-editor] button[type="submit"]')!);
    expect(shadow.querySelector('[data-rb-section-title-editor] [role="alert"]')?.textContent).toBe(
      "Enter a section title before saving.",
    );
    expect(
      Array.from(shadow.querySelectorAll(".rb-outline-group-link")).some(
        (element) => element.textContent === "Automatic section 2",
      ),
    ).toBe(false);

    fireEvent.change(input, { target: { value: "x".repeat(121) } });
    fireEvent.click(shadow.querySelector('[data-rb-section-title-editor] button[type="submit"]')!);
    expect(shadow.querySelector('[data-rb-section-title-editor] [role="alert"]')?.textContent).toBe(
      "Custom titles must be 120 characters or fewer.",
    );
    fireEvent.click(
      Array.from(
        shadow.querySelectorAll<HTMLButtonElement>("[data-rb-section-title-editor] button"),
      ).find((candidate) => candidate.textContent === "Cancel")!,
    );
    expect(shadow.querySelector("[data-rb-section-title-editor]")).toBeNull();
    expect(shadow.activeElement).toBe(renameButton(shadow, "Automatic section 2"));
    expect(READER_CSS).toMatch(
      /\.rb-outline-group-row:focus-within[\s\S]+\.rb-section-title-controls button/,
    );
    expect(READER_CSS).toMatch(/@media \(hover: none\), \(max-width: 900px\)[\s\S]+opacity: 0\.72/);
  });

  it("reloads a saved title and restores the current automatic title with focus", async () => {
    const backend = storage();
    const initial = conversation();
    await act(async () => mountReader(initial));
    let shadow = shadowRoot();
    await saveTitle(shadow, "Automatic section 1", "Saved custom title", false);
    await act(async () => unmountReader());

    const newer = conversation([1, 2, 3], "rename-fixture", {
      1: "New automatic heading after refresh",
    });
    await act(async () => mountReader(newer));
    shadow = shadowRoot();
    expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
      "Saved custom title",
    );
    expect(shadow.querySelectorAll(".rb-document-section-header h2")[0].textContent).toBe(
      "Saved custom title",
    );

    const restore = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Restore automatic title for section “Saved custom title”"]',
    )!;
    await act(async () => {
      fireEvent.click(restore);
      await Promise.resolve();
    });
    await vi.waitFor(() =>
      expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
        "New automatic heading after refresh",
      ),
    );
    expect(shadow.querySelector(".rb-custom-title-indicator")).toBeNull();
    expect(shadow.activeElement).toBe(renameButton(shadow, "New automatic heading after refresh"));
    expect(
      JSON.parse(JSON.stringify(backend.values[SECTION_TITLE_OVERRIDES_STORAGE_KEY])).entries,
    ).toEqual([]);
    expect(newer.turns[0].response?.html).toContain("New automatic heading after refresh");
  });

  it("keeps current-session rename after storage failure and reports the limitation", async () => {
    const backend = storage();
    backend.set.mockRejectedValueOnce(new Error("storage full"));
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();

    await saveTitle(shadow, "Automatic section 1", "Session-only custom title");
    expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
      "Session-only custom title",
    );
    expect(shadow.querySelector(".rb-section-title-status")?.textContent).toBe(
      "Title renamed for this session, but it could not be saved locally.",
    );
  });

  it("keeps overrides response-scoped through earlier/later refresh insertion", async () => {
    const initial = conversation([2, 3]);
    const complete = conversation([1, 2, 3, 4]);
    const responseOne = complete.turns[0].response!;
    const persistedIdentity = sectionTitleOverrideIdentity(complete, responseOne);
    storage({
      [SECTION_TITLE_OVERRIDES_STORAGE_KEY]: {
        version: 1,
        entries: [
          {
            conversationKey: persistedIdentity.conversationKey,
            responseKey: persistedIdentity.responseKey,
            title: "Persisted earlier section",
          },
        ],
      },
    });
    let resolveScan!: (result: ConversationScanResult) => void;
    const pending = new Promise<ConversationScanResult>((resolve) => {
      resolveScan = resolve;
    });
    const refresh = vi.fn(() => pending);
    await act(async () => mountReader(initial, initial.turns[1].response ?? undefined, refresh));
    const shadow = shadowRoot();
    const responseTwo = shadow.querySelector<HTMLElement>('[data-rb-response-id="response-2"]')!;
    const table = responseTwo.querySelector<HTMLElement>(".rb-table-block")!;
    const prompt = responseTwo.querySelector<HTMLDetailsElement>(".rb-prompt-disclosure")!;
    fireEvent.click(prompt.querySelector("summary")!);
    fireEvent.click(table.querySelector('[aria-label="Use wide mode for table 1"]')!);
    await saveTitle(shadow, "Automatic section 2", "Custom middle section");
    expect(refresh).toHaveBeenCalledOnce();

    await act(async () => {
      resolveScan(scanResult(complete));
      await pending;
    });
    const titles = Array.from(shadow.querySelectorAll(".rb-outline-group-link"), (element) =>
      element.textContent?.trim(),
    );
    expect(titles).toEqual([
      "Persisted earlier section",
      "Custom middle section",
      "Automatic section 3",
      "Automatic section 4",
    ]);
    expect(shadow.querySelector('[data-rb-response-id="response-2"]')).toBe(responseTwo);
    expect(responseTwo.querySelector(".rb-table-block")).toBe(table);
    expect(table.dataset.mode).toBe("wide");
    expect(prompt.open).toBe(true);
    expect(shadow.querySelectorAll(".rb-custom-title-indicator")).toHaveLength(2);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
