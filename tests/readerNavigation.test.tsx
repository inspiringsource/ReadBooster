import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ExtractedResponse } from "../src/shared/types";

function response(id: string, html: string, text: string): ExtractedResponse {
  return {
    id,
    source: "chatgpt",
    html,
    text,
    extractedAt: "2026-07-14T00:00:00.000Z",
  };
}

function getReaderShadow(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function openFocusMode(shadow: ShadowRoot): void {
  fireEvent.click(
    Array.from(shadow.querySelectorAll("button")).find((button) => button.textContent === "Focus")!,
  );
}

describe("assistant response navigation", () => {
  it("opens the latest response and navigates without remounting the reader", async () => {
    const responses = [
      response("one", "<p>First response</p>", "First response"),
      response("two", "<p>Second response</p>", "Second response"),
      response("three", "<p>Latest response</p>", "Latest response"),
    ];

    await act(async () => {
      await mountReader(responses);
    });

    const originalHost = document.getElementById(READER_HOST_ID);
    const shadow = getReaderShadow();
    openFocusMode(shadow);
    fireEvent.click(shadow.querySelector('[aria-label="Show next assistant response"]')!);
    fireEvent.click(shadow.querySelector('[aria-label="Show next assistant response"]')!);
    const previous = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Show previous assistant response"]',
    )!;
    const next = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Show next assistant response"]',
    )!;
    const textSize = shadow.querySelector<HTMLSelectElement>('[aria-label="Reader text size"]')!;

    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 3 of 3");
    expect(shadow.querySelector(".rb-content")?.textContent).toContain("Latest response");
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(true);

    fireEvent.change(textSize, { target: { value: "large" } });
    fireEvent.click(previous);
    await vi.waitFor(() =>
      expect(shadow.querySelector(".rb-response-position")?.textContent).toContain(
        "Response 2 of 3",
      ),
    );
    expect(shadow.querySelector(".rb-content")?.textContent).toContain("Second response");
    expect(textSize.value).toBe("large");
    expect(document.getElementById(READER_HOST_ID)).toBe(originalHost);
    expect(document.querySelectorAll(`#${READER_HOST_ID}`)).toHaveLength(1);

    fireEvent.click(previous);
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 1 of 3");

    fireEvent.click(next);
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain("Response 2 of 3");
  });

  it("does not duplicate table controls when switching responses", async () => {
    const responses = [
      response(
        "first-table",
        "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
        "A B 1 2",
      ),
      response(
        "second-table",
        "<table><tr><th>C</th><th>D</th></tr><tr><td>3</td><td>4</td></tr></table>",
        "C D 3 4",
      ),
    ];

    await act(async () => {
      await mountReader(responses);
    });
    const shadow = getReaderShadow();
    openFocusMode(shadow);
    fireEvent.click(shadow.querySelector('[aria-label="Show next assistant response"]')!);
    const previous = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Show previous assistant response"]',
    )!;
    const next = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Show next assistant response"]',
    )!;

    expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(1);
    expect(shadow.querySelector(".rb-table-block")?.getAttribute("data-mode")).toBe("fit");
    fireEvent.click(
      shadow.querySelector<HTMLButtonElement>('[aria-label="Toggle compact text for table 1"]')!,
    );
    expect(shadow.querySelector(".rb-table-block")?.getAttribute("data-density")).toBe("compact");

    fireEvent.click(previous);
    await vi.waitFor(() => expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(1));
    expect(shadow.querySelector(".rb-table-block")?.getAttribute("data-mode")).toBe("fit");
    expect(shadow.querySelector(".rb-table-block")?.getAttribute("data-density")).toBe("normal");

    fireEvent.click(next);
    await vi.waitFor(() =>
      expect(shadow.querySelector(".rb-table-block")?.getAttribute("data-density")).toBe("compact"),
    );
    expect(shadow.querySelectorAll(".rb-block-toolbar")).toHaveLength(1);
  });

  it("closes table fullscreen with Escape without closing the reader", async () => {
    await act(async () => {
      await mountReader([
        response(
          "fullscreen-table",
          "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
          "A B 1 2",
        ),
      ]);
    });
    const shadow = getReaderShadow();
    openFocusMode(shadow);
    const fullscreen = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Open table 1 fullscreen"]',
    )!;

    fireEvent.click(fullscreen);
    expect(shadow.querySelector(".rb-table-block")?.getAttribute("role")).toBe("dialog");

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
      await Promise.resolve();
    });

    expect(document.getElementById(READER_HOST_ID)).not.toBeNull();
    expect(shadow.querySelector(".rb-table-block")?.getAttribute("role")).toBeNull();
    expect(shadow.activeElement).toBe(fullscreen);
  });
});
