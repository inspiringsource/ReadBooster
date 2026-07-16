import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function block(id: string, role: "user" | "assistant", sourceHtml: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = sourceHtml;
  const sanitized = sanitizeResponseHtml(source, id);
  return {
    id,
    role,
    ...sanitized,
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/refresh-fixture",
      sourceConversationId: "refresh-fixture",
      sourceMessageId: id,
      extractedAt: "2026-07-16T10:00:00.000Z",
      contentFingerprint: `fingerprint-${id}-${sanitized.html}`,
    },
  };
}

function responseHtml(number: number): string {
  const extras: Record<number, string> = {
    1: '<figure><img src="data:image/png;base64,AAAA" alt="Chart one" width="640" height="320"><figcaption>Chart one</figcaption></figure>',
    2: "<table><tr><th>Response</th><th>Value</th></tr><tr><td>Two</td><td>Stable</td></tr></table>",
    3: '<pre><code class="language-python">print("three")</code></pre>',
  };
  const detailHeading = number === 5 ? "<h3>Response 5 detail</h3>" : "";
  return `<h2>Response ${number} heading</h2>${detailHeading}<p>Assistant body ${number}</p>${extras[number] ?? ""}`;
}

function conversation(numbers: readonly number[]): ConversationDocument {
  return {
    id: "chatgpt-refresh-fixture",
    source: "chatgpt",
    title: "Refresh fixture",
    sourceUrl: "https://chatgpt.com/c/refresh-fixture",
    extractedAt: "2026-07-16T10:00:00.000Z",
    turns: numbers.map((number, index) => ({
      id: `turn-prompt-${number}-response-${number}`,
      index,
      prompt: block(`prompt-${number}`, "user", `<p>Prompt ${number}</p>`),
      response: block(`response-${number}`, "assistant", responseHtml(number)),
    })),
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

async function openActions(shadow: ShadowRoot): Promise<void> {
  if (!shadow.querySelector("#rb-actions-panel")) {
    fireEvent.click(button(shadow, "Actions"));
    await act(async () => Promise.resolve());
  }
}

describe("conversation refresh and accumulation", () => {
  it("accumulates 3→6 once, preserves enhanced DOM, and updates navigation, Copy, and Print", async () => {
    const initial = conversation([1, 2, 3]);
    const complete = conversation([1, 2, 3, 4, 5, 6]);
    let resolveRefresh!: (document: ConversationDocument | null) => void;
    const firstRefresh = new Promise<ConversationDocument | null>((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = vi.fn().mockReturnValueOnce(firstRefresh).mockResolvedValue(complete);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);

    await act(async () => mountReader(initial, initial.turns[2].response ?? undefined, refresh));
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();
    const responseTwo = shadow.querySelector<HTMLElement>('[data-rb-response-id="response-2"]')!;
    const tableBlock = responseTwo.querySelector<HTMLElement>(".rb-table-block")!;
    const tableScroller = tableBlock.querySelector<HTMLElement>(".rb-table-scroll")!;
    const responseThree = shadow.querySelector<HTMLElement>('[data-rb-response-id="response-3"]')!;
    const codeBlock = responseThree.querySelector<HTMLElement>(".rb-code-block")!;
    const prompt = responseTwo.querySelector<HTMLDetailsElement>(".rb-prompt-disclosure")!;
    fireEvent.click(prompt.querySelector("summary")!);
    fireEvent.click(tableBlock.querySelector('[aria-label="Use wide mode for table 1"]')!);
    tableScroller.scrollLeft = 73;

    await openActions(shadow);
    const refreshButton = button(shadow, "Refresh conversation");
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalledOnce();
    expect(refreshButton.disabled).toBe(true);
    expect(refreshButton.getAttribute("aria-busy")).toBe("true");
    expect(refreshButton.textContent).toBe("Checking for more responses…");
    expect(shadow.querySelector('[role="status"]#rb-refresh-status')?.textContent).toBe(
      "Checking for more responses…",
    );
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalledOnce();

    await act(async () => {
      resolveRefresh(complete);
      await firstRefresh;
    });
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(6);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(6);
    expect(shadow.querySelector("#rb-refresh-status")?.textContent).toBe("3 new responses added");
    expect(shadow.querySelector('[data-rb-response-id="response-2"] .rb-table-block')).toBe(
      tableBlock,
    );
    expect(tableBlock.dataset.mode).toBe("wide");
    expect(tableScroller.scrollLeft).toBe(73);
    expect(shadow.querySelector('[data-rb-response-id="response-3"] .rb-code-block')).toBe(
      codeBlock,
    );
    expect(prompt.open).toBe(true);
    expect(shadow.querySelectorAll("figure")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(1);
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("Response 3 heading");

    fireEvent.click(button(shadow, "Focus"));
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 3 of 6");
    expect(shadow.querySelector(".rb-content--focus")?.textContent).toContain("Assistant body 3");
    expect(
      Array.from(shadow.querySelectorAll("button")).some(
        (candidate) => candidate.textContent === "Refresh conversation",
      ),
    ).toBe(false);
    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(shadow.querySelector('[aria-label="Show previous assistant response"]')!);
    }
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 1 of 6");
    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(shadow.querySelector('[aria-label="Show next assistant response"]')!);
    }
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 6 of 6");
    fireEvent.click(button(shadow, "Document"));

    await openActions(shadow);
    fireEvent.click(button(shadow, "Refresh conversation"));
    await act(async () => Promise.resolve());
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(shadow.querySelector("#rb-refresh-status")?.textContent).toBe(
      "No additional responses found",
    );
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(6);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(1);

    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    const copied = String(writeText.mock.calls[0][0]);
    for (let number = 1; number <= 6; number += 1) {
      expect(copied).toContain(`Assistant body ${number}`);
    }
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(6);
  });

  it("inserts earlier turns while preserving the active section and its viewport offset", async () => {
    const initial = conversation([4, 5, 6]);
    const complete = conversation([1, 2, 3, 4, 5, 6]);
    let resolveRefresh!: (document: ConversationDocument | null) => void;
    const pending = new Promise<ConversationDocument | null>((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = vi.fn(() => pending);
    await act(async () => mountReader(initial, initial.turns[2].response ?? undefined, refresh));
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });
    const responseFiveGroup =
      shadow.querySelectorAll<HTMLButtonElement>(".rb-outline-group-link")[1];
    fireEvent.click(responseFiveGroup);
    const responseFive = shadow.querySelector<HTMLElement>('[data-rb-response-id="response-5"]')!;
    const responseFiveHeading = responseFive.querySelector<HTMLElement>("h3")!;
    fireEvent.click(
      shadow
        .querySelectorAll<HTMLElement>(".rb-outline-group")[1]
        .querySelector(".rb-outline-link")!,
    );
    let afterMerge = false;
    vi.spyOn(scrollArea, "getBoundingClientRect").mockReturnValue({
      top: 20,
    } as DOMRect);
    vi.spyOn(responseFiveHeading, "getBoundingClientRect").mockImplementation(
      () => ({ top: afterMerge ? 360 : 120 }) as DOMRect,
    );
    scrollArea.scrollTop = 500;

    await openActions(shadow);
    fireEvent.click(button(shadow, "Refresh conversation"));
    afterMerge = true;
    await act(async () => {
      resolveRefresh(complete);
      await pending;
    });

    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(6);
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("Response 5 heading");
    expect(shadow.querySelector('.rb-outline-link[aria-current="location"]')?.textContent).toBe(
      "Response 5 detail",
    );
    expect(scrollArea.scrollTop).toBe(740);
    expect(shadow.querySelector('[data-rb-response-id="response-5"]')).toBe(responseFive);
  });

  it("keeps accumulated content on failure, clears it on unmount, and has no DOM or storage coupling", async () => {
    const initial = conversation([1, 2, 3]);
    const complete = conversation([1, 2, 3, 4, 5, 6]);
    const refresh = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(complete);
    const storageSet = vi.fn();
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn().mockResolvedValue({}), set: storageSet } },
    });
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    await act(async () => mountReader(initial, initial.turns[2].response ?? undefined, refresh));
    const shadow = shadowRoot();
    await openActions(shadow);

    fireEvent.click(button(shadow, "Refresh conversation"));
    await act(async () => Promise.resolve());
    expect(shadow.querySelector("#rb-refresh-status")?.textContent).toBe(
      "Conversation could not be refreshed",
    );
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(3);

    fireEvent.click(button(shadow, "Refresh conversation"));
    await act(async () => Promise.resolve());
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(6);
    expect(storageSet).not.toHaveBeenCalled();

    await act(async () => unmountReader());
    expect(clearTimeout).toHaveBeenCalled();
    await act(async () => mountReader(initial));
    expect(shadowRoot().querySelectorAll(".rb-document-section")).toHaveLength(3);

    const readerSource = readFileSync("src/reader/ReaderView.tsx", "utf8");
    expect(readerSource).not.toMatch(
      /data-message-author-role|conversation-turn-|backend-api\/estuary/,
    );
    expect(readerSource).not.toMatch(/localStorage|indexedDB/);
  });

  it("ignores a pending refresh result after the reader is closed", async () => {
    const initial = conversation([1, 2, 3]);
    let resolveRefresh!: (document: ConversationDocument | null) => void;
    const pending = new Promise<ConversationDocument | null>((resolve) => {
      resolveRefresh = resolve;
    });
    await act(async () =>
      mountReader(initial, initial.turns[2].response ?? undefined, () => pending),
    );
    const shadow = shadowRoot();
    await openActions(shadow);
    fireEvent.click(button(shadow, "Refresh conversation"));
    expect(button(shadow, "Checking for more responses…").disabled).toBe(true);

    await act(async () => unmountReader());
    await act(async () => {
      resolveRefresh(conversation([1, 2, 3, 4, 5, 6]));
      await pending;
    });
    expect(document.getElementById(READER_HOST_ID)).toBeNull();
  });
});
