import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import packageJson from "../package.json";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ExtractedResponse } from "../src/shared/types";

const PRINT_CSS = readFileSync("src/reader/reader.print.css", "utf8");

const WIDE_TABLE_RESPONSE: ExtractedResponse = {
  id: "print-wide-table",
  source: "chatgpt",
  html: `
    <h2>Wide comparison</h2>
    <table>
      <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr></thead>
      <tbody><tr><td>Alpha</td><td>Beta</td><td>Gamma</td><td>Delta</td><td>Epsilon</td><td>identifier_abcdefghijklmnopqrstuvwxyz0123456789</td></tr></tbody>
    </table>
  `,
  text: "Wide comparison\n\nA\tB\tC\tD\tE\tF\nAlpha\tBeta\tGamma\tDelta\tEpsilon\tidentifier",
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

describe("print layout", () => {
  it("marks interactive controls as print-hidden and adds active-response metadata", async () => {
    await act(async () => {
      await mountReader([WIDE_TABLE_RESPONSE]);
    });
    const shadow = shadowRoot();
    openFocusMode(shadow);
    fireEvent.click(
      Array.from(shadow.querySelectorAll("button")).find(
        (button) => button.textContent === "Actions",
      )!,
    );
    const readerToolbar = shadow.querySelector<HTMLElement>(".rb-toolbar")!;
    const tableToolbar = shadow.querySelector<HTMLElement>(".rb-block-toolbar")!;
    const metadata = shadow.querySelector<HTMLElement>(".rb-print-metadata")!;
    const block = shadow.querySelector<HTMLElement>(".rb-table-block")!;
    const outline = shadow.querySelector<HTMLElement>(".rb-outline")!;

    expect(readerToolbar.classList.contains("rb-print-hidden")).toBe(true);
    expect(tableToolbar.classList.contains("rb-print-hidden")).toBe(true);
    expect(outline.classList.contains("rb-print-hidden")).toBe(true);
    expect(metadata.textContent).toContain("ReadBooster — Focused response");
    expect(metadata.textContent).toContain("ChatGPT · Response 1 of 1");
    expect(block.dataset.printWidthPressure).toBe("high");
    expect(block.classList.contains("rb-table-print-wide")).toBe(true);
    expect(shadow.querySelector(".rb-table-print-hint")?.textContent).toBe(
      "Wide table: Landscape orientation may improve readability.",
    );
  });

  it("normalizes every screen table mode to printable width in static print CSS", () => {
    expect(PRINT_CSS).toContain("@media print");
    expect(PRINT_CSS).toContain("@page");
    expect(PRINT_CSS).toMatch(/\.rb-print-hidden[\s\S]+display: none !important/);
    expect(PRINT_CSS).toMatch(
      /\.rb-table-block\[data-mode="wide"\][\s\S]+transform: none !important[\s\S]+width: 100% !important/,
    );
    expect(PRINT_CSS).toMatch(
      /\.rb-table-block\[data-mode="wide"\] table[\s\S]+min-width: 0 !important[\s\S]+table-layout: fixed !important[\s\S]+width: 100% !important/,
    );
    expect(PRINT_CSS).toMatch(/\.rb-table-scroll[\s\S]+overflow: visible !important/);
    expect(PRINT_CSS).toMatch(/\.rb-prompt-disclosure[\s\S]+display: none !important/);
    expect(PRINT_CSS).toMatch(/\.rb-header-panel[\s\S]+display: none !important/);
    expect(PRINT_CSS).toMatch(/\.rb-version-label[\s\S]+display: none !important/);
    expect(PRINT_CSS).not.toContain("rb-turn-indicator");
    expect(PRINT_CSS).toMatch(
      /\.rb-document-section-header[\s\S]+break-after: avoid-page[\s\S]+page-break-after: avoid/,
    );
    expect(PRINT_CSS).not.toMatch(/100d?v[wh]|max-content|translate[XY]?\(/);
  });

  it("defines repeatable headers and practical row and heading page breaks", () => {
    expect(PRINT_CSS).toMatch(
      /\.rb-table-block thead[\s\S]+display: table-header-group[\s\S]+page-break-inside: avoid/,
    );
    expect(PRINT_CSS).toMatch(
      /\.rb-table-block tr[\s\S]+break-inside: avoid[\s\S]+page-break-inside: avoid/,
    );
    expect(PRINT_CSS).toMatch(
      /\.rb-content h1,[\s\S]+break-after: avoid-page[\s\S]+page-break-after: avoid/,
    );
    expect(PRINT_CSS).toMatch(
      /\.rb-table-block\s*,[\s\S]+break-inside: auto[\s\S]+page-break-inside: auto/,
    );
  });

  it("keeps Wide, Compact, Fullscreen, scroll position, and logical content after repeated print", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await act(async () => {
      await mountReader([WIDE_TABLE_RESPONSE]);
    });
    const shadow = shadowRoot();
    openFocusMode(shadow);
    const block = shadow.querySelector<HTMLElement>(".rb-table-block")!;
    const tableScroller = shadow.querySelector<HTMLElement>(".rb-table-scroll")!;
    const logicalTable = shadow.querySelector<HTMLTableElement>("table")!;

    fireEvent.click(shadow.querySelector('[aria-label="Use wide mode for table 1"]')!);
    fireEvent.click(shadow.querySelector('[aria-label="Toggle compact text for table 1"]')!);
    fireEvent.click(shadow.querySelector('[aria-label="Open table 1 fullscreen"]')!);
    tableScroller.scrollLeft = 160;
    const originalBlock = block;
    fireEvent.click(
      Array.from(shadow.querySelectorAll("button")).find(
        (button) => button.textContent === "Actions",
      )!,
    );

    fireEvent.click(shadow.querySelector('[aria-label="Print focused response"]')!);
    window.dispatchEvent(new Event("beforeprint"));
    window.dispatchEvent(new Event("afterprint"));
    fireEvent.click(shadow.querySelector('[aria-label="Print focused response"]')!);

    expect(print).toHaveBeenCalledTimes(2);
    expect(shadow.querySelector(".rb-table-block")).toBe(originalBlock);
    expect(block.dataset.mode).toBe("wide");
    expect(block.dataset.density).toBe("compact");
    expect(block.dataset.rbTableFullscreen).toBe("true");
    expect(tableScroller.scrollLeft).toBe(160);
    expect(logicalTable.querySelectorAll("th, td")).toHaveLength(12);
    expect(document.querySelectorAll("#readbooster-print-style")).toHaveLength(1);
    expect(addEventListener.mock.calls.filter(([type]) => type === "beforeprint")).toHaveLength(0);
    expect(addEventListener.mock.calls.filter(([type]) => type === "afterprint")).toHaveLength(0);
  });

  it("uses package version 0.5.1 as the manifest source of truth", () => {
    const manifestSource = readFileSync("src/manifest/manifest.ts", "utf8");
    expect(packageJson.version).toBe("0.5.1");
    expect(manifestSource).toContain("version: packageJson.version");
  });

  it("prints responsive figures while excluding code controls", () => {
    expect(PRINT_CSS).toMatch(/\.rb-content figure[\s\S]+break-inside: avoid/);
    expect(PRINT_CSS).toMatch(/\.rb-content figure img[\s\S]+max-width: 100% !important/);
    expect(PRINT_CSS).toContain(".rb-code-block");
    expect(PRINT_CSS).toContain(".rb-print-hidden");
    expect(PRINT_CSS).toContain(".rb-block-toolbar");
  });
});
