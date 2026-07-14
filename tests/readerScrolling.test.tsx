import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import type { ExtractedResponse } from "../src/shared/types";

function response(id: string, html: string): ExtractedResponse {
  return {
    id,
    source: "chatgpt",
    html,
    text: "Response text",
    extractedAt: "2026-07-14T00:00:00.000Z",
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

describe("reader scrolling structure", () => {
  it("bounds the Shadow DOM hierarchy and keeps a table-free response in the vertical scroller", async () => {
    await act(async () => {
      await mountReader([
        response("long", `<h2>Long response</h2>${"<p>Readable paragraph.</p>".repeat(40)}`),
      ]);
    });

    const host = document.getElementById(READER_HOST_ID)!;
    const shadow = shadowRoot();
    const mountPoint = shadow.querySelector<HTMLElement>(".rb-reader-mount")!;
    const reader = shadow.querySelector<HTMLElement>(".rb-reader")!;
    const toolbar = shadow.querySelector<HTMLElement>(".rb-toolbar")!;
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    const content = shadow.querySelector<HTMLElement>(".rb-content")!;

    expect(host.style.position).toBe("fixed");
    expect(host.style.height).toBe("100dvh");
    expect(host.style.overflow).toBe("hidden");
    expect(mountPoint.parentNode).toBe(shadow);
    expect(reader.contains(toolbar)).toBe(true);
    expect(reader.contains(scrollArea)).toBe(true);
    expect(toolbar.parentElement).toBe(reader);
    expect(scrollArea.parentElement).toBe(reader);
    expect(scrollArea.dataset.rbScrollContainer).toBe("vertical");
    expect(scrollArea.contains(content)).toBe(true);
    expect(content.querySelector(".rb-table-block")).toBeNull();
  });

  it("keeps multiple table scroll viewports inside the main vertical scroller", async () => {
    await act(async () => {
      await mountReader([
        response(
          "tables",
          `${"<p>Before table.</p>".repeat(10)}
           <table><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></table>
           ${"<p>Between tables.</p>".repeat(10)}
           <table><tr><th>E</th><th>F</th><th>G</th><th>H</th></tr><tr><td>5</td><td>6</td><td>7</td><td>8</td></tr></table>
           ${"<p>After table.</p>".repeat(10)}`,
        ),
      ]);
    });

    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    const tableScrollers = shadow.querySelectorAll<HTMLElement>(".rb-table-scroll");
    const toolbars = shadow.querySelectorAll<HTMLElement>(".rb-block-toolbar");
    shadow
      .querySelectorAll<HTMLButtonElement>('[aria-label^="Use wide mode for table"]')
      .forEach((button) => fireEvent.click(button));

    expect(scrollArea.dataset.rbScrollContainer).toBe("vertical");
    expect(tableScrollers).toHaveLength(2);
    expect(toolbars).toHaveLength(2);
    tableScrollers.forEach((tableScroller) => {
      expect(tableScroller.dataset.rbScrollViewport).toBe("true");
      expect(scrollArea.contains(tableScroller)).toBe(true);
      expect(tableScroller.closest(".rb-table-block")?.querySelector(".rb-block-toolbar")).not.toBe(
        null,
      );
      expect(tableScroller.closest(".rb-table-block")?.getAttribute("data-mode")).toBe("wide");
    });
  });

  it("routes reader navigation keys to the vertical scroller", async () => {
    await act(async () => {
      await mountReader([response("keys", "<p>Keyboard scrolling</p>")]);
    });
    const scrollArea = shadowRoot().querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 2000 },
      scrollBy: { configurable: true, value: vi.fn() },
      scrollTo: { configurable: true, value: vi.fn() },
    });

    fireEvent.keyDown(window, { key: "PageDown" });
    expect(scrollArea.scrollBy).toHaveBeenCalledWith({ top: 425 });
    fireEvent.keyDown(window, { key: "End" });
    expect(scrollArea.scrollTo).toHaveBeenCalledWith({ top: 2000 });
  });

  it("does not lock or replace the main scroller during fullscreen or response switching", async () => {
    const responses = [
      response("first", "<p>First</p>"),
      response(
        "second",
        "<p>Second</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>",
      ),
    ];
    await act(async () => {
      await mountReader(responses);
    });
    const shadow = shadowRoot();
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    scrollArea.scrollTop = 180;
    const fullscreen = shadow.querySelector<HTMLButtonElement>(
      '[aria-label="Open table 1 fullscreen"]',
    )!;

    fireEvent.click(fullscreen);
    expect(scrollArea.dataset.rbScrollContainer).toBe("vertical");
    expect(scrollArea.style.overflow).toBe("");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(scrollArea.scrollTop).toBe(180);
    expect(scrollArea.style.overflow).toBe("");

    fireEvent.click(
      shadow.querySelector<HTMLButtonElement>('[aria-label="Show previous assistant response"]')!,
    );
    expect(shadow.querySelector(".rb-scroll-area")).toBe(scrollArea);
    expect(scrollArea.dataset.rbScrollContainer).toBe("vertical");
  });

  it("reopens with one clean scroll hierarchy", async () => {
    await act(async () => {
      await mountReader([response("first", "<p>First mount</p>")]);
    });
    unmountReader();
    await act(async () => {
      await mountReader([response("second", "<p>Second mount</p>")]);
    });

    expect(document.querySelectorAll(`#${READER_HOST_ID}`)).toHaveLength(1);
    expect(shadowRoot().querySelectorAll(".rb-reader-mount")).toHaveLength(1);
    expect(shadowRoot().querySelectorAll('[data-rb-scroll-container="vertical"]')).toHaveLength(1);
  });
});
