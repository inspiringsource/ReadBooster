import { readFileSync } from "node:fs";

import { act, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { assignHighlightBlockIds } from "../src/reader/highlights/highlightAnchoring";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import {
  HIGHLIGHT_SCHEMA_VERSION,
  HIGHLIGHT_STORAGE_KEY,
  createHighlight,
  highlightSectionIdentity,
} from "../src/shared/highlights";
import {
  STICKER_SCHEMA_VERSION,
  STICKER_STORAGE_KEY,
  createSticker,
  stickerSectionIdentity,
} from "../src/shared/stickers";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

const PRINT_CSS = readFileSync("src/reader/reader.print.css", "utf8");

function block(id: string, role: "user" | "assistant", html: string): DocumentContentBlock {
  const temporary = document.createElement("div");
  temporary.innerHTML = html;
  return {
    id,
    role,
    html,
    text: temporary.textContent ?? "",
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/print-studio",
      sourceConversationId: "print-studio",
      sourceMessageId: id,
      extractedAt: "2026-07-30T09:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(): ConversationDocument {
  return {
    id: "print-studio",
    source: "chatgpt",
    title: "Print Studio fixture",
    sourceUrl: "https://chatgpt.com/c/print-studio",
    extractedAt: "2026-07-30T09:00:00.000Z",
    turns: [
      {
        id: "turn-1",
        index: 0,
        prompt: block("prompt-1", "user", "<p>Explain the comparison.</p>"),
        response: block(
          "response-1",
          "assistant",
          '<h2>First answer</h2><p>Alpha important passage omega.</p><table><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>One</td></tr></tbody></table><img src="https://example.invalid/chart.png" alt="Comparison chart">',
        ),
      },
      {
        id: "turn-2",
        index: 1,
        prompt: block("prompt-2", "user", "<p>Show an implementation.</p>"),
        response: block(
          "response-2",
          "assistant",
          '<h2>Second answer</h2><pre><code class="language-ts">const ready = true;</code></pre>',
        ),
      },
    ],
  };
}

function storedAnnotations(current: ConversationDocument) {
  const response = current.turns[0].response!;
  const identity = highlightSectionIdentity(current, response);
  const temporary = document.createElement("article");
  temporary.innerHTML = response.html;
  const paragraph = assignHighlightBlockIds(temporary).find(
    (candidate) => candidate.tagName === "P",
  )!;
  const highlight = createHighlight(
    identity,
    {
      blockId: paragraph.dataset.rbHighlightBlockId!,
      selectedText: "important passage",
      prefix: "Alpha ",
      suffix: " omega.",
      startOffset: 6,
      endOffset: 23,
    },
    "yellow",
    1,
    "print-highlight",
  );
  const sticker = {
    ...createSticker(stickerSectionIdentity(current, response), { xRatio: 1, yRatio: 0.2 }),
    id: "print-sticker",
    text: "Verify the comparison before sharing.",
    isCollapsed: true,
  };
  return { highlight, sticker };
}

function storage(current: ConversationDocument) {
  const annotations = storedAnnotations(current);
  const values: Record<string, unknown> = {
    [HIGHLIGHT_STORAGE_KEY]: {
      version: HIGHLIGHT_SCHEMA_VERSION,
      entries: [annotations.highlight],
    },
    [STICKER_STORAGE_KEY]: {
      version: STICKER_SCHEMA_VERSION,
      entries: [annotations.sticker],
    },
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update)),
      },
    },
    runtime: { getURL: (path: string) => path },
  });
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function openPrintStudio(shadow: ShadowRoot): void {
  fireEvent.click(
    within(shadow as unknown as HTMLElement).getByRole("button", { name: "Actions" }),
  );
  fireEvent.click(
    within(shadow as unknown as HTMLElement).getByRole("button", { name: "Print Studio" }),
  );
}

describe("Print Studio Reader integration", () => {
  it("builds an independent preview and applies content, layout, ordering, and print controls", async () => {
    const current = conversation();
    storage(current);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await act(async () => mountReader(current));
    const shadow = shadowRoot();
    const readerSectionOrder = Array.from(
      shadow.querySelectorAll<HTMLElement>(".rb-document-section"),
      (section) => section.dataset.rbResponseId,
    );
    openPrintStudio(shadow);

    const studio = within(shadow as unknown as HTMLElement).getByRole("dialog", {
      name: "Print Studio",
    });
    expect(studio).toBeTruthy();
    expect(shadow.querySelector(".rb-print-page")?.textContent).toContain("First answer");
    expect(shadow.querySelector(".rb-print-page")?.textContent).toContain("Second answer");
    expect(shadow.querySelector(".rb-print-prompt")).toBeNull();
    expect(shadow.querySelector(".rb-print-stickers")).toBeNull();
    expect(
      shadow.querySelector(".rb-print-page mark[data-rb-highlight-id='print-highlight']")
        ?.textContent,
    ).toBe("important passage");
    expect(
      shadow
        .querySelector(".rb-print-page mark[data-rb-highlight-id='print-highlight']")
        ?.getAttribute("role"),
    ).toBeNull();
    expect(shadow.querySelector(".rb-print-page img")).not.toBeNull();

    fireEvent.click(within(studio).getByRole("checkbox", { name: "User prompts" }));
    fireEvent.click(within(studio).getByRole("checkbox", { name: "Stickers" }));
    expect(shadow.querySelector(".rb-print-prompt")?.textContent).toContain(
      "Explain the comparison.",
    );
    expect(shadow.querySelector(".rb-print-stickers")?.textContent).toContain(
      "Verify the comparison before sharing.",
    );

    fireEvent.click(within(studio).getByRole("checkbox", { name: "Images" }));
    expect(shadow.querySelector(".rb-print-page img")).toBeNull();
    fireEvent.click(within(studio).getByRole("checkbox", { name: "Show highlight styling" }));
    expect(shadow.querySelector(".rb-print-page mark[data-rb-highlight-id]")).toBeNull();
    expect(shadow.querySelector(".rb-print-page")?.textContent).toContain("important passage");

    fireEvent.change(within(studio).getByLabelText("Page size"), { target: { value: "letter" } });
    fireEvent.change(within(studio).getByLabelText("Orientation"), {
      target: { value: "landscape" },
    });
    fireEvent.change(within(studio).getByLabelText("Margins"), {
      target: { value: "comfortable" },
    });
    await vi.waitFor(() => {
      const globalPrintStyle =
        document.getElementById("readbooster-print-style")?.textContent ?? "";
      expect(globalPrintStyle).toContain("size: Letter landscape");
      expect(globalPrintStyle).toContain("margin: 18mm");
    });

    const sectionToggles = [
      within(studio).getByRole("checkbox", { name: "Explain the comparison." }),
      within(studio).getByRole("checkbox", { name: "Show an implementation." }),
    ];
    fireEvent.click(sectionToggles[0]);
    expect(shadow.querySelector("#rb-print-title-rb-section-response-1")).toBeNull();
    fireEvent.click(sectionToggles[0]);

    fireEvent.click(
      within(studio).getByRole("button", { name: "Move “Show an implementation.” earlier" }),
    );
    expect(
      Array.from(
        shadow.querySelectorAll(".rb-print-document-section > header h2"),
        (heading) => heading.textContent,
      ),
    ).toEqual(["Show an implementation.", "Explain the comparison."]);
    const newPageChecks = within(studio).getAllByRole("checkbox", { name: "New page" });
    fireEvent.click(newPageChecks[1]);
    expect(
      shadow.querySelector('.rb-print-document-section[data-page-break="true"]'),
    ).not.toBeNull();

    fireEvent.click(within(studio).getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(within(studio).getByRole("button", { name: "Back to Reader" }));
    expect(shadow.querySelector(".rb-print-studio")).toBeNull();
    expect(
      Array.from(
        shadow.querySelectorAll<HTMLElement>(".rb-document-section"),
        (section) => section.dataset.rbResponseId,
      ),
    ).toEqual(readerSectionOrder);
    expect(shadow.querySelector("mark[data-rb-highlight-id='print-highlight']")).not.toBeNull();
    expect(shadow.querySelector("[data-rb-sticker-id='print-sticker']")).not.toBeNull();
  });

  it("closes on Escape, keeps quick Print, and defines print-only Studio isolation", async () => {
    const current = conversation();
    storage(current);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await act(async () => mountReader(current));
    const shadow = shadowRoot();
    openPrintStudio(shadow);
    fireEvent.keyDown(shadow.querySelector(".rb-print-studio")!, { key: "Escape" });
    expect(shadow.querySelector(".rb-print-studio")).toBeNull();

    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", { name: "Actions" }),
    );
    fireEvent.click(
      within(shadow as unknown as HTMLElement).getByRole("button", {
        name: "Print conversation document",
      }),
    );
    expect(print).toHaveBeenCalledOnce();
    expect(PRINT_CSS).toContain('.rb-reader[data-print-studio-open="true"] > .rb-reader-body');
    expect(PRINT_CSS).toMatch(/\.rb-print-studio-controls[\s\S]+display: none !important/);
    expect(PRINT_CSS).toMatch(
      /\.rb-print-document-section\[data-page-break="true"\][\s\S]+break-before: page/,
    );
    expect(PRINT_CSS).toMatch(/\.rb-print-studio \.rb-highlight--yellow[\s\S]+background/);
  });
});
