import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { fastReadingFontFace } from "../src/reader/fastReadingFont";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { DEFAULT_READER_PREFERENCES } from "../src/shared/preferences";
import type {
  ConversationDocument,
  ConversationScanResult,
  DocumentContentBlock,
  ReadingFont,
} from "../src/shared/types";

const READER_CSS = readFileSync("src/reader/reader.css", "utf8");

function block(id: string, html: string): DocumentContentBlock {
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
      sourceUrl: "https://chatgpt.com/c/fast-reading",
      sourceConversationId: "fast-reading",
      sourceMessageId: id,
      extractedAt: "2026-07-18T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(sectionCount = 2): ConversationDocument {
  return {
    id: "fast-reading-conversation",
    source: "chatgpt",
    title: "Fast Reading fixture",
    sourceUrl: "https://chatgpt.com/c/fast-reading",
    extractedAt: "2026-07-18T00:00:00.000Z",
    turns: [
      {
        id: "turn-one",
        index: 0,
        prompt: null,
        response: block(
          "response-one",
          '<h2>First heading</h2><p>Ordinary <strong>strong text</strong> and <a href="https://example.com">a link</a>.</p><blockquote>Quoted text</blockquote><table><tr><th>Term</th></tr><tr><td>Meaning</td></tr></table><p><code>inline()</code></p><pre><code>const exact = true;</code></pre><p class="math">x + y</p>',
        ),
      },
      {
        id: "turn-two",
        index: 1,
        prompt: null,
        response: block("response-two", "<p>Later continuous-document section</p>"),
      },
    ].slice(0, sectionCount),
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function settingsButton(shadow: ShadowRoot): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === "Reading settings",
  )!;
}

describe("Fast Reading font", () => {
  it("offers one Reading style control and persists each style without replacing content", async () => {
    const stored: Record<string, unknown> = {};
    const storageSet = vi.fn(async (value: Record<string, unknown>) =>
      Object.assign(stored, value),
    );
    vi.stubGlobal("chrome", {
      runtime: { getURL: (path: string) => `chrome-extension://readbooster-test/${path}` },
      storage: {
        local: {
          get: vi.fn(async (key: string) => (key in stored ? { [key]: stored[key] } : {})),
          set: storageSet,
        },
      },
    });

    const close = await act(async () => mountReader(conversation()));
    let shadow = shadowRoot();
    const content = shadow.querySelector(".rb-content")!;
    const originalHtml = content.innerHTML;
    fireEvent.click(settingsButton(shadow));
    const select = shadow.querySelector<HTMLSelectElement>('[aria-label="Reading style"]')!;

    expect(shadow.querySelector('[aria-label="Reading preset"]')).toBeNull();
    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      "Default",
      "Serif",
      "Dyslexia-friendly",
      "Fast Reading",
    ]);
    expect(shadow.querySelector("#rb-fast-reading-description")).toBeNull();

    for (const readingFont of [
      "serif",
      "dyslexia-friendly",
      "fast-reading",
    ] satisfies ReadingFont[]) {
      fireEvent.change(select, { target: { value: readingFont } });
      expect(shadow.querySelector(".rb-reader")?.getAttribute("data-reading-style")).toBe(
        readingFont,
      );
    }
    await vi.waitFor(() =>
      expect(storageSet).toHaveBeenLastCalledWith({
        readerPreferences: { ...DEFAULT_READER_PREFERENCES, readingFont: "fast-reading" },
      }),
    );
    expect(shadow.querySelector(".rb-content")).toBe(content);
    expect(content.innerHTML).toBe(originalHtml);
    expect(shadow.querySelector("#rb-fast-reading-description")?.textContent).toBe(
      "Uses fixation-guided letter emphasis to support faster scanning.",
    );
    expect(select.getAttribute("aria-describedby")).toBe("rb-fast-reading-description");

    fireEvent.change(select, { target: { value: "default" } });
    expect(shadow.querySelector("#rb-fast-reading-description")).toBeNull();
    expect(select.hasAttribute("aria-describedby")).toBe(false);
    fireEvent.change(select, { target: { value: "fast-reading" } });

    await act(async () => close());
    await act(async () => mountReader(conversation()));
    shadow = shadowRoot();
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-reading-style")).toBe(
      "fast-reading",
    );
  });

  it("declares one static regular face and scopes one authoritative typography variable", () => {
    const declaration = fastReadingFontFace("/fonts/Fast_Sans.ttf");
    expect(declaration).toContain('font-family: "ReadBooster Fast Sans"');
    expect(declaration).toContain('src: url("/fonts/Fast_Sans.ttf") format("truetype")');
    expect(declaration).toMatch(/font-weight: 400/);
    expect(declaration).not.toMatch(/font-weight:\s*100\s+900/);
    expect(READER_CSS).toContain("--rb-reader-content-font");
    expect(READER_CSS).toMatch(
      /data-reading-style="fast-reading"[\s\S]+font-feature-settings: "calt" 1/,
    );
    expect(READER_CSS).toContain("font-variant-ligatures: contextual");
    expect(READER_CSS).toMatch(
      /\.rb-content\s*{[\s\S]+font-family: var\(--rb-reader-content-font\)/,
    );
    expect(READER_CSS).toMatch(/:where\([\s\S]+strong,[\s\S]+th,[\s\S]+font-family: inherit/);
    expect(READER_CSS).toMatch(/\.rb-content code[\s\S]+ui-monospace/);
    expect(READER_CSS).toMatch(/\.math,[\s\S]+\.katex,[\s\S]+\.MathJax/);
    expect(READER_CSS).toMatch(
      /\.rb-settings-grid\s*{[\s\S]+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });

  it("applies the root style to every section discovered after opening", async () => {
    let resolveRefresh!: (result: ConversationScanResult) => void;
    const pending = new Promise<ConversationScanResult>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.stubGlobal("chrome", {
      runtime: { getURL: (path: string) => `chrome-extension://readbooster-test/${path}` },
      storage: {
        local: {
          get: vi.fn(async (key: string) =>
            key === "readerPreferences"
              ? {
                  readerPreferences: {
                    ...DEFAULT_READER_PREFERENCES,
                    readingFont: "fast-reading",
                  },
                }
              : {},
          ),
          set: vi.fn(),
        },
      },
    });

    await act(async () =>
      mountReader(conversation(1), undefined, vi.fn().mockReturnValue(pending)),
    );
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();
    const firstContent = shadow.querySelector(".rb-content");
    await act(async () => {
      resolveRefresh({
        document: conversation(2),
        scanPerformed: true,
        completed: true,
        terminationReason: "bottom",
      });
      await pending;
    });

    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(2);
    expect(shadow.querySelector(".rb-content")).toBe(firstContent);
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-reading-style")).toBe(
      "fast-reading",
    );
    for (const content of shadow.querySelectorAll(".rb-content")) {
      expect(content.closest('[data-reading-style="fast-reading"]')).not.toBeNull();
    }

    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Focus",
      )!,
    );
    expect(
      shadow.querySelector('[aria-label="Focused response content"] .rb-content'),
    ).not.toBeNull();
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-reading-style")).toBe(
      "fast-reading",
    );
  });
});
