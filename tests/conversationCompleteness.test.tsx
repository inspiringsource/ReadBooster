import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatGPTAdapter } from "../src/content/adapters/ChatGPTAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { deriveConversationSections } from "../src/reader/presentation";
import { getConversationPipelineDiagnostics } from "../src/shared/developmentDiagnostics";

function responseMarkup(index: number, total: number): string {
  const number = index + 1;
  const prompt =
    index === 0
      ? ""
      : `<article data-turn="user" data-message-id="prompt-${number}"><p>Prompt ${number}</p></article>`;
  const heading = number % 6 === 0 ? "" : `<h2>Response ${number} heading</h2>`;
  const table =
    number % 5 === 0
      ? `<table><tr><th>Response</th><th>Total</th></tr><tr><td>${number}</td><td>${total}</td></tr></table>`
      : "";
  const code =
    number % 4 === 0
      ? `<pre><code class="language-javascript">const responseNumber = ${number};</code></pre>`
      : "";
  const chart =
    number % 7 === 0
      ? `<div data-fixture-chart-card><span>Chart for response ${number}</span><div><img alt="Output image" width="640" height="320" src="https://chatgpt.com/backend-api/estuary/content?id=fixture-${number}"></div><button>Download</button></div>`
      : "";
  const assistantAttributes =
    number % 2 === 0
      ? `data-turn="assistant" data-message-id="response-${number}"`
      : `data-message-author-role="assistant" data-message-id="response-${number}"`;

  return `${prompt}<div data-fixture-response-wrapper="${number}">${chart}<article ${assistantAttributes}><div class="markdown">${heading}<p>Assistant body ${number}</p>${table}${code}</div></article></div>`;
}

function conversationMarkup(total: number): string {
  const responses = Array.from({ length: total }, (_, index) => responseMarkup(index, total));
  if (total >= 5) {
    responses.splice(
      5,
      0,
      '<article data-turn="assistant" data-message-id="incomplete-stream"><div data-message-content></div></article>',
    );
  }
  return responses.join("");
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function modeButton(shadow: ShadowRoot, label: "Document" | "Focus"): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>(".rb-mode-switch button")).find(
    (button) => button.textContent === label,
  )!;
}

function actionTrigger(shadow: ShadowRoot): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === "Actions",
  )!;
}

describe("complete conversation pipeline", () => {
  it("extracts, normalizes, renders, outlines, copies, prints, and focuses all 10 responses", async () => {
    document.body.innerHTML = conversationMarkup(10);
    const conversation = new ChatGPTAdapter(
      document,
      "chatgpt.com",
      "https://chatgpt.com/c/ten-response-fixture",
    ).getConversationDocument()!;

    expect(conversation.turns).toHaveLength(10);
    expect(conversation.turns[0].prompt).toBeNull();
    expect(conversation.turns.map((turn) => turn.response?.text)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        index === 5
          ? `Assistant body ${index + 1}`
          : expect.stringContaining(`Assistant body ${index + 1}`),
      ),
    );
    const sections = deriveConversationSections(conversation);
    expect(sections).toHaveLength(10);
    expect(sections.map((section) => section.responseBlockId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `response-${index + 1}`),
    );
    expect(sections[5].title).toBe("Prompt 6");

    const writeText = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    vi.stubGlobal("print", print);
    await act(async () => mountReader(conversation));
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();
    const renderedSections = Array.from(
      shadow.querySelectorAll<HTMLElement>(".rb-document-section"),
    );

    expect(renderedSections).toHaveLength(10);
    expect(renderedSections.map((section) => section.dataset.rbResponseId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `response-${index + 1}`),
    );
    expect(new Set(renderedSections.map((section) => section.id)).size).toBe(10);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(10);
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("Response 10 heading");
    expect(shadow.querySelectorAll("figure")).toHaveLength(1);
    expect(shadow.querySelector("figure figcaption")?.textContent).toBe("Chart for response 7");
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(2);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(2);

    const diagnostics = getConversationPipelineDiagnostics();
    expect(diagnostics).toMatchObject({
      rawAssistantCandidates: 11,
      rawUserCandidates: 9,
      canonicalCandidates: 20,
      deduplicatedCandidates: 20,
      extractedAssistantBlocks: 10,
      normalizedTurns: 10,
      derivedDocumentSections: 10,
      renderedDocumentSections: 10,
    });

    fireEvent.click(modeButton(shadow, "Focus"));
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain(
      "Response 10 of 10",
    );
    const previous = () =>
      shadow.querySelector<HTMLButtonElement>('[aria-label="Show previous assistant response"]')!;
    for (let index = 0; index < 9; index += 1) {
      fireEvent.click(previous());
    }
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain(
      "Response 1 of 10",
    );
    expect(previous().disabled).toBe(true);
    const next = () =>
      shadow.querySelector<HTMLButtonElement>('[aria-label="Show next assistant response"]')!;
    for (let index = 0; index < 9; index += 1) {
      fireEvent.click(next());
    }
    expect(shadow.querySelector(".rb-response-position")?.textContent).toContain(
      "Response 10 of 10",
    );
    expect(next().disabled).toBe(true);

    fireEvent.click(modeButton(shadow, "Document"));
    fireEvent.click(actionTrigger(shadow));
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    const copied = String(writeText.mock.calls[0][0]);
    for (let number = 1; number <= 10; number += 1) {
      expect(copied).toContain(`Assistant body ${number}`);
    }
    fireEvent.click(shadow.querySelector('[aria-label="Print conversation document"]')!);
    expect(print).toHaveBeenCalledOnce();
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(10);
  });

  it("keeps a 25-response mixed-content document structurally stable", async () => {
    document.body.innerHTML = conversationMarkup(25);
    const conversation = new ChatGPTAdapter(
      document,
      "chatgpt.com",
      "https://chatgpt.com/c/twenty-five-response-fixture",
    ).getConversationDocument()!;
    const sections = deriveConversationSections(conversation);

    expect(conversation.turns).toHaveLength(25);
    expect(sections).toHaveLength(25);
    expect(sections.map((section) => section.responseBlockId)).toEqual(
      Array.from({ length: 25 }, (_, index) => `response-${index + 1}`),
    );
    expect(new Set(sections.map((section) => section.id)).size).toBe(25);

    await act(async () => mountReader(conversation));
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(25);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(25);
    expect(shadow.querySelectorAll("figure")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(5);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(6);
    expect(
      shadow.querySelector('.rb-outline-group-link[aria-current="location"]')?.textContent,
    ).toBe("Response 25 heading");
    expect(getConversationPipelineDiagnostics()).toMatchObject({
      extractedAssistantBlocks: 25,
      normalizedTurns: 25,
      derivedDocumentSections: 25,
      renderedDocumentSections: 25,
    });
  });
});
