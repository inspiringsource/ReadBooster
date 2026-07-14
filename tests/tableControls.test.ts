import { fireEvent } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { enhanceTables } from "../src/reader/blockControls";

function tableFixture(): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <table>
      <thead><tr><th scope="col">Name</th><th>Type</th><th>Location</th><th>URL</th></tr></thead>
      <tbody><tr><td>Ordinary readable words</td><td>Example</td><td>identifier_abcdefghijklmnopqrstuvwxyz0123456789</td><td><a href="https://example.com/a/very/long/path">Link</a></td></tr></tbody>
    </table>
  `;
  document.body.append(root);
  return root;
}

function twoColumnFixture(): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <table>
      <thead><tr><th scope="col">Term</th><th scope="col">Explanation</th></tr></thead>
      <tbody><tr><td>Reader</td><td>This regular sentence should use the remaining width and wrap normally when needed.</td></tr></tbody>
    </table>
  `;
  document.body.append(root);
  return root;
}

describe("table block controls", () => {
  it("injects one toolbar and switches Fit, Wide, Compact, and Reset modes", () => {
    const root = tableFixture();
    const sessionStates = new Map();
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates });
    enhanceTables(root, { responseKey: "response", sessionStates });

    const block = root.querySelector<HTMLElement>(".rb-table-block")!;
    expect(root.querySelectorAll(".rb-block-toolbar")).toHaveLength(1);
    expect(block.dataset.mode).toBe("fit");

    fireEvent.click(root.querySelector('[aria-label="Fit table 1"]')!);
    expect(block.dataset.mode).toBe("fit");

    fireEvent.click(root.querySelector('[aria-label="Use wide mode for table 1"]')!);
    expect(block.dataset.mode).toBe("wide");

    fireEvent.click(root.querySelector('[aria-label="Toggle compact text for table 1"]')!);
    expect(block.dataset.density).toBe("compact");
    expect(block.style.getPropertyValue("--rb-table-font-size")).toBe("0.7em");
    expect(block.style.getPropertyValue("--rb-table-line-height")).toBe("1.28");
    expect(block.style.getPropertyValue("--rb-table-cell-padding")).toBe("0.28em 0.42em");

    fireEvent.click(root.querySelector('[aria-label="Reset table 1 display"]')!);
    expect(block.dataset.mode).toBe("fit");
    expect(block.dataset.density).toBe("normal");
    expect(block.style.getPropertyValue("--rb-table-font-size")).toBe("0.82em");
    expect(sessionStates.size).toBe(0);

    cleanup();
    expect(root.querySelector(".rb-table-block")).toBeNull();
    expect(root.querySelector("table")).not.toBeNull();
  });

  it("opens fullscreen, closes with Escape, and restores trigger focus", () => {
    const root = tableFixture();
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const block = root.querySelector<HTMLElement>(".rb-table-block")!;
    const fullscreen = root.querySelector<HTMLButtonElement>(
      '[aria-label="Open table 1 fullscreen"]',
    )!;
    const close = root.querySelector<HTMLButtonElement>('[aria-label="Close fullscreen table 1"]')!;

    fullscreen.focus();
    fireEvent.click(fullscreen);
    expect(block.dataset.rbTableFullscreen).toBe("true");
    expect(block.getAttribute("role")).toBe("dialog");
    expect(close.hidden).toBe(false);
    expect(document.activeElement).toBe(close);

    const fullscreenFocusable = Array.from(
      block.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = fullscreenFocusable[0];
    const last = fullscreenFocusable.at(-1)!;
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(block.dataset.rbTableFullscreen).toBeUndefined();
    expect(block.dataset.mode).toBe("fit");
    expect(close.hidden).toBe(true);
    expect(document.activeElement).toBe(fullscreen);
    cleanup();
  });

  it("creates an internal scroll region with a column-aware table width", () => {
    const root = tableFixture();
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const block = root.querySelector<HTMLElement>(".rb-table-block")!;
    const scrollRegion = root.querySelector<HTMLElement>(".rb-table-scroll")!;
    const toolbar = root.querySelector<HTMLElement>(".rb-block-toolbar")!;
    const viewport = root.querySelector<HTMLElement>(".rb-table-viewport")!;

    expect(block.dataset.mode).toBe("fit");
    expect(block.dataset.columns).toBe("4");
    expect(block.style.getPropertyValue("--rb-table-wide-min-width")).toBe("44rem");
    expect(scrollRegion.getAttribute("role")).toBe("region");
    expect(scrollRegion.tabIndex).toBe(0);
    expect(scrollRegion.querySelector("table")).not.toBeNull();
    expect(toolbar.parentElement).toBe(block);
    expect(viewport.parentElement).toBe(block);
    expect(scrollRegion.parentElement).toBe(viewport);
    expect(toolbar.contains(scrollRegion)).toBe(false);
    expect(scrollRegion.querySelector(".rb-table-long-token")?.textContent).toContain(
      "identifier_",
    );
    cleanup();
  });

  it("defaults two-column tables to Fit with a bounded first-column allocation", () => {
    const root = twoColumnFixture();
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const block = root.querySelector<HTMLElement>(".rb-table-block")!;

    expect(block.dataset.mode).toBe("fit");
    expect(block.dataset.columns).toBe("2");
    expect(block.style.getPropertyValue("--rb-table-fit-min-width")).toBe("30rem");
    expect(block.style.getPropertyValue("--rb-table-first-column-width")).toBe(
      "clamp(8rem, 28%, 16rem)",
    );
    cleanup();
  });

  it("uses effective colspan-aware column counts without selecting Wide automatically", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <table>
        <thead><tr><th colspan="3">Grouped details</th><th>Reference</th></tr></thead>
        <tbody><tr><td>Alpha content that needs room</td><td>Beta content</td><td>Gamma content</td><td>Longer supporting reference</td></tr></tbody>
      </table>
      <table>
        <tr><th>A</th><th>B</th><th>C</th><th>D</th></tr>
        <tr><td>1</td><td>2</td><td>3</td><td>4</td></tr>
      </table>
    `;
    document.body.append(root);
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const blocks = root.querySelectorAll<HTMLElement>(".rb-table-block");

    expect(blocks[0].dataset.columns).toBe("4");
    expect(blocks[0].dataset.mode).toBe("fit");
    expect(blocks[1].dataset.columns).toBe("4");
    expect(blocks[1].dataset.mode).toBe("fit");
    cleanup();
  });

  it("defaults one-column and six-column tables to Fit", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <table><tr><th>Only column</th></tr><tr><td>Value</td></tr></table>
      <table><tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th></tr></table>
    `;
    document.body.append(root);
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const blocks = root.querySelectorAll<HTMLElement>(".rb-table-block");

    expect(blocks[0].dataset.columns).toBe("1");
    expect(blocks[0].dataset.mode).toBe("fit");
    expect(blocks[1].dataset.columns).toBe("6");
    expect(blocks[1].dataset.mode).toBe("fit");
    cleanup();
  });

  it("updates subtle left and right scroll affordance state", () => {
    const root = tableFixture();
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const viewport = root.querySelector<HTMLElement>(".rb-table-viewport")!;
    const scrollRegion = root.querySelector<HTMLElement>(".rb-table-scroll")!;
    Object.defineProperties(scrollRegion, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 900 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });

    fireEvent.scroll(scrollRegion);
    expect(viewport.dataset.canScrollLeft).toBe("false");
    expect(viewport.dataset.canScrollRight).toBe("true");

    scrollRegion.scrollLeft = 250;
    fireEvent.scroll(scrollRegion);
    expect(viewport.dataset.canScrollLeft).toBe("true");
    expect(viewport.dataset.canScrollRight).toBe("true");

    scrollRegion.scrollLeft = 500;
    fireEvent.scroll(scrollRegion);
    expect(viewport.dataset.canScrollLeft).toBe("true");
    expect(viewport.dataset.canScrollRight).toBe("false");
    cleanup();
  });

  it("keeps the Wide panel viewport-constrained and contains horizontal overflow", () => {
    const root = tableFixture();
    const layoutContainer = document.createElement("main");
    layoutContainer.className = "rb-scroll-area";
    layoutContainer.style.paddingLeft = "16px";
    layoutContainer.style.paddingRight = "16px";
    Object.defineProperty(layoutContainer, "clientWidth", { configurable: true, value: 1000 });
    layoutContainer.append(root);
    document.body.append(layoutContainer);
    const cleanup = enhanceTables(root, { responseKey: "response", sessionStates: new Map() });
    const block = root.querySelector<HTMLElement>(".rb-table-block")!;
    const toolbar = root.querySelector<HTMLElement>(".rb-block-toolbar")!;
    const scrollRegion = root.querySelector<HTMLElement>(".rb-table-scroll")!;

    fireEvent.click(root.querySelector('[aria-label="Use wide mode for table 1"]')!);
    expect(block.dataset.mode).toBe("wide");
    expect(block.dataset.layout).toBe("viewport-constrained");
    expect(block.style.getPropertyValue("--rb-table-panel-inline-gutter")).toBe("32px");
    expect(block.style.getPropertyValue("--rb-table-panel-width")).toBe("968px");
    expect(scrollRegion.dataset.rbScrollViewport).toBe("true");
    expect(toolbar.parentElement).toBe(block);
    expect(scrollRegion.closest(".rb-table-viewport")?.parentElement).toBe(block);
    expect(block.style.width).not.toBe("max-content");
    cleanup();
  });
});
