import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";

const PRINT_CSS = readFileSync("src/reader/reader.print.css", "utf8");

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function button(shadow: ShadowRoot, label: string): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  )!;
}

describe("live-derived chart rendering", () => {
  it("renders associated charts once across Document, Focus, print, and reopening", async () => {
    document.body.innerHTML = readFileSync("tests/fixtures/chatgpt-live-chart.html", "utf8");
    const conversation = new ChatGPTAdapter(
      document,
      "chatgpt.com",
      "https://chatgpt.com/c/FIXTURE_CONVERSATION",
    ).getConversationDocument()!;
    expect(conversation.turns[0].response?.html).toContain('<code lang="python">');
    const print = vi.fn();
    vi.stubGlobal("print", print);

    const close = await act(async () =>
      mountReader(conversation, conversation.turns[0].response ?? undefined),
    );
    let shadow = shadowRoot();
    expect(shadow.querySelectorAll(".rb-document-section figure")).toHaveLength(2);
    expect(shadow.querySelectorAll(".rb-code-toolbar")).toHaveLength(1);
    expect(shadow.querySelector(".rb-code-block code")?.getAttribute("lang")).toBe("python");
    await vi.waitFor(() =>
      expect(shadow.querySelector(".rb-code-language")?.textContent).toBe("Python"),
    );

    const firstGroup = shadow.querySelector<HTMLButtonElement>(".rb-outline-group-link")!;
    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: vi.fn() });
    fireEvent.click(firstGroup);
    fireEvent.click(button(shadow, "Focus"));
    expect(shadow.querySelectorAll(".rb-content--focus figure")).toHaveLength(1);
    expect(shadow.querySelector("figcaption")?.textContent).toContain("Grande Armée");

    fireEvent.click(button(shadow, "Document"));
    expect(shadow.querySelectorAll(".rb-document-section figure")).toHaveLength(2);
    fireEvent.click(button(shadow, "Actions"));
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();
    expect(shadow.querySelectorAll(".rb-document-section figure")).toHaveLength(2);
    expect(PRINT_CSS).toMatch(/\.rb-content figure[\s\S]+max-width: 100% !important/);

    await act(async () => close());
    expect(document.getElementById(READER_HOST_ID)).toBeNull();
    await act(async () => mountReader(conversation));
    shadow = shadowRoot();
    expect(shadow.querySelectorAll(".rb-document-section figure")).toHaveLength(2);
    expect(shadow.querySelectorAll(".rb-code-toolbar")).toHaveLength(1);
  });
});
