import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";

const FIXTURE = readFileSync("tests/fixtures/chatgpt-writing-block.html", "utf8");
const PRINT_CSS = readFileSync("src/reader/reader.print.css", "utf8");

function conversationFor(responseId = "writing-primary") {
  const source = new DOMParser().parseFromString(FIXTURE, "text/html");
  const conversation = new ChatGPTAdapter(
    source,
    "chatgpt.com",
    "https://chatgpt.com/c/writing-block-reader",
  ).getConversationDocument()!;
  return {
    ...conversation,
    turns: conversation.turns.filter((turn) => turn.response?.id === responseId),
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function modeButton(shadow: ShadowRoot, label: "Document" | "Focus"): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>(".rb-mode-switch button")).find(
    (button) => button.textContent === label,
  )!;
}

describe("ChatGPT document-block reader presentation", () => {
  it("renders one static semantic document block without absorbing surrounding response prose", async () => {
    await act(async () => mountReader(conversationFor()));
    const shadow = shadowRoot();
    const response = shadow.querySelector<HTMLElement>(".rb-content--document")!;
    const documentBlock = response.querySelector<HTMLElement>("section.rb-document-block")!;
    const content = documentBlock.querySelector<HTMLElement>(".rb-document-block__content")!;

    expect(response.querySelectorAll(".rb-document-block")).toHaveLength(1);
    expect(documentBlock.querySelector(".rb-document-block__label")?.textContent).toBe("Document");
    expect(documentBlock.querySelector('[aria-label="Copy document"]')).not.toBeNull();
    expect(content.querySelector("h2")?.textContent).toBe("Interview questions");
    expect(content.querySelector("ul li")?.textContent).toContain("Keep the answer concise.");
    expect(response.textContent).toContain("Introductory text");
    expect(response.textContent).toContain("Concluding text");
    expect(content.textContent).not.toContain("Introductory text");
    expect(content.textContent).not.toContain("Concluding text");
    expect(
      documentBlock.querySelector(
        "[contenteditable], button:not(.rb-document-block__copy):not(.rb-code-toolbar button):not(.rb-block-toolbar button)",
      ),
    ).toBeNull();
    expect(response.textContent).not.toContain("Open editor");
    expect(response.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(response.querySelectorAll(".rb-code-block")).toHaveLength(1);
    expect(documentBlock.querySelector('[aria-label="Use wide mode for table 1"]')).not.toBeNull();
  });

  it("copies only semantic document content while inner code Copy remains independent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    await act(async () => mountReader(conversationFor()));
    const shadow = shadowRoot();
    const documentBlock = shadow.querySelector<HTMLElement>(".rb-document-block")!;
    const documentCopy = documentBlock.querySelector<HTMLButtonElement>(
      '[aria-label="Copy document"]',
    )!;

    await act(async () => {
      fireEvent.click(documentCopy);
      await Promise.resolve();
    });
    const copiedDocument = String(writeText.mock.calls.at(-1)?.[0]);
    expect(copiedDocument).toContain("Interview questions\n\nTell me about yourself.");
    expect(copiedDocument).toContain("- Keep the answer concise.");
    expect(copiedDocument).toContain("Topic\tGoal");
    expect(copiedDocument).toContain("const concise = true;");
    expect(copiedDocument).not.toContain("Introductory text");
    expect(copiedDocument).not.toContain("Concluding text");
    expect(copiedDocument).not.toContain("Document");
    expect(copiedDocument).not.toContain("Copy code");
    expect(documentCopy.textContent).toBe("Copied");

    const codeCopy = documentBlock.querySelector<HTMLButtonElement>(
      '[aria-label="Copy typescript code block 1"]',
    )!;
    await act(async () => {
      fireEvent.click(codeCopy);
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith("const concise = true;");
  });

  it("uses the same document presentation in Focus mode without duplication", async () => {
    await act(async () => mountReader(conversationFor()));
    const shadow = shadowRoot();

    fireEvent.click(modeButton(shadow, "Focus"));
    expect(shadow.querySelectorAll(".rb-content--focus .rb-document-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-reader .rb-document-block")).toHaveLength(1);
    expect(shadow.querySelector('.rb-content--focus [aria-label="Copy document"]')).not.toBeNull();

    fireEvent.click(modeButton(shadow, "Document"));
    expect(shadow.querySelectorAll(".rb-content--document .rb-document-block")).toHaveLength(1);
  });

  it("keeps the label and boundary printable while excluding the Copy control", () => {
    expect(PRINT_CSS).toContain(".rb-document-block");
    expect(PRINT_CSS).toMatch(/\.rb-document-block__header[\s\S]+break-after: avoid-page/);
    expect(PRINT_CSS).toContain(".rb-print-hidden");
  });

  it("renders each marked block once and gives unmarked or incomplete responses no frame", async () => {
    await act(async () => mountReader(conversationFor("writing-multiple")));
    expect(shadowRoot().querySelectorAll(".rb-document-block")).toHaveLength(2);

    await act(async () => mountReader(conversationFor("writing-incomplete")));
    expect(shadowRoot().querySelectorAll(".rb-document-block")).toHaveLength(0);
    expect(shadowRoot().querySelector(".rb-content")?.textContent).toContain(
      "After an incomplete block.",
    );

    await act(async () => mountReader(conversationFor("normal-markdown")));
    expect(shadowRoot().querySelectorAll(".rb-document-block")).toHaveLength(0);
    expect(shadowRoot().querySelector(".rb-content h2")?.textContent).toBe("Ordinary response");
  });
});
