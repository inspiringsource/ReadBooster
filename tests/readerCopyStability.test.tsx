import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ExtractedResponse } from "../src/shared/types";

const TABLE_RESPONSE: ExtractedResponse = {
  id: "copy-table",
  source: "chatgpt",
  html: `
    <p>Before table.</p>
    <table><tr><th>Name</th><th>Value</th></tr><tr><td>Mode</td><td>Stable</td></tr></table>
    <p>After table.</p>
  `,
  text: "Before table.\n\nName\tValue\nMode\tStable\n\nAfter table.",
  extractedAt: "2026-07-14T00:00:00.000Z",
};

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function openFocusMode(shadow: ShadowRoot): void {
  fireEvent.click(
    Array.from(shadow.querySelectorAll("button")).find((button) => button.textContent === "Focus")!,
  );
}

function openPanel(shadow: ShadowRoot, label: "Actions" | "Reading settings"): void {
  fireEvent.click(
    Array.from(shadow.querySelectorAll("button")).find((button) => button.textContent === label)!,
  );
}

describe("copy stability", () => {
  it("updates only Copy status while preserving the enhanced table subtree and state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    await act(async () => {
      await mountReader([TABLE_RESPONSE]);
    });
    const shadow = shadowRoot();
    openFocusMode(shadow);
    const content = shadow.querySelector<HTMLElement>(".rb-content")!;
    const block = shadow.querySelector<HTMLElement>(".rb-table-block")!;
    const toolbar = shadow.querySelector<HTMLElement>(".rb-block-toolbar")!;
    const tableScroller = shadow.querySelector<HTMLElement>(".rb-table-scroll")!;

    fireEvent.click(shadow.querySelector('[aria-label="Use wide mode for table 1"]')!);
    fireEvent.click(shadow.querySelector('[aria-label="Toggle compact text for table 1"]')!);
    tableScroller.scrollLeft = 140;
    openPanel(shadow, "Actions");

    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy focused response"]')!);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(TABLE_RESPONSE.text);
    expect(shadow.querySelector('[aria-label="Copy focused response"]')?.textContent).toBe(
      "Copied",
    );
    expect(shadow.querySelector('[role="status"]')?.textContent).toBe("Focused response copied.");
    expect(shadow.querySelector(".rb-content")).toBe(content);
    expect(shadow.querySelector(".rb-table-block")).toBe(block);
    expect(shadow.querySelector(".rb-block-toolbar")).toBe(toolbar);
    expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(1);
    expect(block.dataset.mode).toBe("wide");
    expect(block.dataset.density).toBe("compact");
    expect(tableScroller.scrollLeft).toBe(140);

    openPanel(shadow, "Reading settings");
    fireEvent.change(shadow.querySelector('[aria-label="Reader appearance"]')!, {
      target: { value: "dark" },
    });
    fireEvent.change(shadow.querySelector('[aria-label="Reader text size"]')!, {
      target: { value: "large" },
    });
    fireEvent.change(shadow.querySelector('[aria-label="Reader spacing"]')!, {
      target: { value: "roomy" },
    });
    expect(shadow.querySelector(".rb-content")).toBe(content);
    expect(shadow.querySelector(".rb-table-block")).toBe(block);
    expect(block.dataset.mode).toBe("wide");
    expect(block.dataset.density).toBe("compact");
  });

  it("announces Copy failure without changing response content or table controls", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      userAgent: "jsdom",
    });
    await act(async () => {
      await mountReader([TABLE_RESPONSE]);
    });
    const shadow = shadowRoot();
    openFocusMode(shadow);
    openPanel(shadow, "Actions");
    const content = shadow.querySelector<HTMLElement>(".rb-content")!;
    const block = shadow.querySelector<HTMLElement>(".rb-table-block")!;

    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy focused response"]')!);
      await Promise.resolve();
    });

    expect(shadow.querySelector('[aria-label="Copy focused response"]')?.textContent).toBe(
      "Copy failed",
    );
    expect(shadow.querySelector('[role="status"]')?.textContent).toBe("Copy failed.");
    expect(shadow.querySelector(".rb-content")).toBe(content);
    expect(shadow.querySelector(".rb-table-block")).toBe(block);
    expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(1);
    expect(block.dataset.mode).toBe("fit");
  });
});
