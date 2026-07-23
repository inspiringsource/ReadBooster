import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";
import { buildOutline, flattenOutline } from "../src/reader/outline";

const FIXTURE = readFileSync("tests/fixtures/chatgpt-writing-block.html", "utf8");

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("ChatGPT editable writing blocks", () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
  });

  it("normalizes editable document content in source order before host cleanup", () => {
    const response = new ChatGPTAdapter(
      document,
      "chatgpt.com",
      "https://chatgpt.com/c/writing-block-fixture",
    )
      .getAllAssistantResponses()
      .find((candidate) => candidate.id === "writing-primary")!;
    const output = document.createElement("div");
    output.innerHTML = response.html;
    const documentBlock = output.querySelector<HTMLElement>(
      '[data-readbooster-content-block="document"]',
    )!;

    expect(documentBlock).not.toBeNull();
    expect(documentBlock.querySelector("h2")?.textContent).toBe("Interview questions");
    expect(documentBlock.querySelector("p em")?.textContent).toBe("about yourself");
    expect(
      Array.from(output.querySelectorAll("li")).map((item) =>
        item.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(
      expect.arrayContaining([
        "Keep the answer concise.",
        "Connect the answer to the role. Use a concrete example.",
        "Use a concrete example.",
      ]),
    );
    expect(output.querySelector("table thead th")?.textContent).toBe("Topic");
    expect(output.querySelector("pre code")?.textContent).toBe("const concise = true;");
    expect(output.querySelector("pre code")?.getAttribute("lang")).toBe("typescript");
    expect(output.querySelector("strong")?.textContent).toBe("text");
    expect(output.querySelector("b")?.textContent).toBe("text");
    expect(output.querySelector('a[href="https://example.com/introduction"]')).not.toBeNull();
    expect(documentBlock.contains(output.querySelector("p")!)).toBe(false);

    const text = output.textContent ?? "";
    expect(text.indexOf("Introductory text")).toBeLessThan(text.indexOf("Interview questions"));
    expect(text.indexOf("Interview questions")).toBeLessThan(text.indexOf("Concluding text"));
    expect(countOccurrences(text, "Interview questions")).toBe(1);
    expect(countOccurrences(text, "Tell me about yourself.")).toBe(1);
  });

  it("removes editing attributes, controls, and unsafe markup without weakening sanitization", () => {
    const response = new ChatGPTAdapter(document, "chatgpt.com")
      .getAllAssistantResponses()
      .find((candidate) => candidate.id === "writing-primary")!;
    const output = document.createElement("div");
    output.innerHTML = response.html;

    expect(
      output.querySelector(
        "button, [role='toolbar'], [contenteditable], [spellcheck], [translate], [tabindex], script",
      ),
    ).toBeNull();
    expect(
      output.querySelector("[data-writing-block], [data-testid], [data-readbooster-writing-block]"),
    ).toBeNull();
    expect(output.innerHTML).not.toMatch(/\son[a-z]+=/i);
    expect(output.textContent).not.toContain("Edit");
    expect(output.textContent).not.toContain("Copy");
    expect(output.textContent).not.toContain("Open editor");
    expect(output.textContent).not.toContain("Fullscreen");
    expect(output.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("extracts multiple writing blocks exactly once in their original DOM order", () => {
    const response = new ChatGPTAdapter(document, "chatgpt.com")
      .getAllAssistantResponses()
      .find((candidate) => candidate.id === "writing-multiple")!;
    const text = response.text;
    const output = document.createElement("div");
    output.innerHTML = response.html;

    expect(output.querySelectorAll('[data-readbooster-content-block="document"]')).toHaveLength(2);
    expect(countOccurrences(text, "First block content.")).toBe(1);
    expect(countOccurrences(text, "Second block content.")).toBe(1);
    expect(text.indexOf("Before the first block.")).toBeLessThan(text.indexOf("First block"));
    expect(text.indexOf("First block content.")).toBeLessThan(text.indexOf("Between the blocks."));
    expect(text.indexOf("Between the blocks.")).toBeLessThan(text.indexOf("Second block"));
    expect(text.indexOf("Second block content.")).toBeLessThan(
      text.indexOf("After the second block."),
    );
  });

  it("skips an incomplete shell without throwing or losing surrounding response content", () => {
    const response = new ChatGPTAdapter(document, "chatgpt.com")
      .getAllAssistantResponses()
      .find((candidate) => candidate.id === "writing-incomplete")!;

    expect(response.text).toContain("Before an incomplete block.");
    expect(response.text).toContain("After an incomplete block.");
    expect(response.text).not.toContain("Edit");
    expect(response.text).not.toContain("Loading");
    expect(response.html).not.toContain("data-readbooster-content-block");
  });

  it("leaves ordinary ChatGPT Markdown extraction unchanged", () => {
    const response = new ChatGPTAdapter(document, "chatgpt.com")
      .getAllAssistantResponses()
      .find((candidate) => candidate.id === "normal-markdown")!;
    const output = document.createElement("div");
    output.innerHTML = response.html;

    expect(output.querySelector("h2")?.textContent).toBe("Ordinary response");
    expect(output.querySelector("p")?.textContent).toBe(
      "Normal ChatGPT Markdown remains available.",
    );
    expect(output.querySelector("[data-readbooster-content-block]")).toBeNull();
  });

  it("keeps writing-block headings available to the shared outline builder", () => {
    const conversation = new ChatGPTAdapter(document, "chatgpt.com").getConversationDocument()!;
    const writingResponse = conversation.turns
      .map((turn) => turn.response)
      .find((response) => response?.id === "writing-primary")!;

    expect(flattenOutline(buildOutline([writingResponse])).map((item) => item.text)).toContain(
      "Interview questions",
    );
  });

  it("captures a completed writing block on a later extraction used by Refresh", () => {
    const shell = document.querySelector<HTMLElement>(
      '[data-message-id="writing-incomplete"] [data-writing-block="true"]',
    )!;
    const adapter = new ChatGPTAdapter(document, "chatgpt.com");

    expect(
      adapter.getAllAssistantResponses().find((response) => response.id === "writing-incomplete")
        ?.text,
    ).not.toContain("Completed after streaming");

    shell.insertAdjacentHTML(
      "beforeend",
      `<div data-writing-block-fullscreen-editor-region="true" contenteditable="true">
        <h2>Completed after streaming</h2>
        <p>Refresh can now capture this content.</p>
      </div>`,
    );

    const refreshed = adapter
      .getAllAssistantResponses()
      .find((response) => response.id === "writing-incomplete")!;
    expect(refreshed.text).toContain("Completed after streaming");
    expect(refreshed.text).toContain("Refresh can now capture this content.");
    expect(countOccurrences(refreshed.text, "Completed after streaming")).toBe(1);
  });
});
