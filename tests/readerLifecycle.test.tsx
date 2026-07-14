import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import type { ExtractedResponse } from "../src/shared/types";

const RESPONSE: ExtractedResponse = {
  id: "response-1",
  source: "chatgpt",
  html: "<h2>Heading</h2><p>Response text.</p>",
  text: "Heading\n\nResponse text.",
  extractedAt: "2026-07-14T00:00:00.000Z",
};

function readerHost(): HTMLElement {
  return document.getElementById(READER_HOST_ID)!;
}

describe("reader lifecycle", () => {
  it("allows only the newest concurrent mount to create a reader", async () => {
    let resolveStorage!: (value: Record<string, unknown>) => void;
    const storageResult = new Promise<Record<string, unknown>>((resolve) => {
      resolveStorage = resolve;
    });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(() => storageResult),
          set: vi.fn(),
        },
      },
    });

    const firstMount = mountReader(RESPONSE);
    const secondMount = mountReader({ ...RESPONSE, id: "response-2" });
    resolveStorage({});

    await act(async () => {
      await Promise.all([firstMount, secondMount]);
    });

    expect(document.querySelectorAll(`#${READER_HOST_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll("#readbooster-print-style")).toHaveLength(1);
  });

  it("replaces repeated mounts and completely cleans temporary state", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open reader";
    const ordinaryBackground = document.createElement("main");
    const alreadyInert = document.createElement("aside");
    alreadyInert.setAttribute("inert", "");
    document.body.append(opener, ordinaryBackground, alreadyInert);
    opener.focus();

    await act(async () => {
      await mountReader(RESPONSE);
      await mountReader({ ...RESPONSE, id: "replacement" });
    });

    expect(document.querySelectorAll(`#${READER_HOST_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll("#readbooster-print-style")).toHaveLength(1);
    expect(ordinaryBackground.inert).toBe(true);
    expect(alreadyInert.inert).toBe(true);

    await act(async () => unmountReader());

    expect(document.querySelector(`#${READER_HOST_ID}`)).toBeNull();
    expect(document.querySelector("#readbooster-print-style")).toBeNull();
    expect(ordinaryBackground.hasAttribute("inert")).toBe(false);
    expect(alreadyInert.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("wraps focus in both directions, closes on Escape, and restores focus", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Optimize Reading";
    const backgroundLink = document.createElement("a");
    backgroundLink.href = "#background";
    document.body.append(opener, backgroundLink);
    opener.focus();

    await act(async () => {
      await mountReader(RESPONSE);
    });

    const host = readerHost();
    const shadow = host.shadowRoot!;
    const focusable = Array.from(
      shadow.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), a[href]",
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1)!;

    expect(last.getAttribute("aria-label")).toBe("Close reader");
    expect(shadow.activeElement).toBe(last);
    expect(backgroundLink.inert).toBe(true);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(shadow.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(shadow.activeElement).toBe(last);

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
    });

    expect(document.getElementById(READER_HOST_ID)).toBeNull();
    expect(backgroundLink.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
