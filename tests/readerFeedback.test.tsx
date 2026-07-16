import { act, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { FEEDBACK_FORM_URL, openFeedbackForm } from "../src/reader/feedback";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import type { ConversationDocument, DocumentContentBlock } from "../src/shared/types";

function block(id: string, role: "user" | "assistant", html: string): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = html;
  return {
    id,
    role,
    ...sanitizeResponseHtml(source, id),
    provenance: {
      kind: "original",
      platform: "chatgpt",
      sourceUrl: "https://chatgpt.com/c/private-conversation-id",
      sourceConversationId: "private-conversation-id",
      sourceMessageId: id,
      extractedAt: "2026-07-16T00:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(): ConversationDocument {
  return {
    id: "feedback-conversation",
    source: "chatgpt",
    title: "Private conversation title",
    sourceUrl: "https://chatgpt.com/c/private-conversation-id",
    extractedAt: "2026-07-16T00:00:00.000Z",
    turns: [
      {
        id: "feedback-turn",
        index: 0,
        prompt: block("feedback-prompt", "user", "<p>Private prompt text</p>"),
        response: block(
          "feedback-response",
          "assistant",
          "<h2>Private response heading</h2><p>Private assistant text</p>",
        ),
      },
    ],
  };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function button(shadow: ShadowRoot, label: string): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label,
  )!;
}

function openActions(shadow: ShadowRoot): void {
  fireEvent.click(button(shadow, "Actions"));
}

function feedbackTrigger(shadow: ShadowRoot): HTMLButtonElement {
  return shadow.querySelector<HTMLButtonElement>('[aria-label="Send feedback"]')!;
}

function openFeedbackModal(shadow: ShadowRoot): HTMLButtonElement {
  openActions(shadow);
  const trigger = feedbackTrigger(shadow);
  fireEvent.click(trigger);
  return trigger;
}

afterEach(() => vi.useRealTimers());

describe("feedback integration", () => {
  it("keeps the published plain Tally URL for the explicit new-tab fallback", () => {
    const openWindow = vi.fn();

    expect(openFeedbackForm(openWindow)).toBe(true);
    expect(openWindow).toHaveBeenCalledWith(
      "https://tally.so/r/QKWqjp",
      "_blank",
      "noopener,noreferrer",
    );
    expect(new URL(FEEDBACK_FORM_URL).search).toBe("");
    expect(new URL(FEEDBACK_FORM_URL).hash).toBe("");
    expect(
      openFeedbackForm(() => {
        throw new Error("blocked");
      }),
    ).toBe(false);
  });

  it("opens a titled iframe modal in Document mode without remounting or opening a tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const reader = shadow.querySelector(".rb-reader");
    const content = shadow.querySelector(".rb-content");
    const trigger = openFeedbackModal(shadow);
    const modal = shadow.querySelector<HTMLElement>("#rb-feedback-dialog")!;
    const iframe = modal.querySelector<HTMLIFrameElement>("iframe")!;

    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.getAttribute("aria-labelledby")).toBe("rb-feedback-dialog-title");
    expect(
      shadow.querySelector(".rb-feedback-overlay")?.classList.contains("rb-print-hidden"),
    ).toBe(true);
    expect(shadow.querySelector(".rb-feedback-overlay script")).toBeNull();
    expect(iframe.src).toBe(FEEDBACK_FORM_URL);
    expect(iframe.title).toBe("ReadBooster feedback form");
    expect(shadow.querySelector(".rb-feedback-loading")?.textContent).toBe(
      "Loading feedback form…",
    );
    expect(open).not.toHaveBeenCalled();
    expect(shadow.querySelector(".rb-reader")).toBe(reader);
    expect(shadow.querySelector(".rb-content")).toBe(content);
    expect(shadow.querySelector(".rb-toolbar")?.hasAttribute("inert")).toBe(true);
    expect(shadow.querySelector(".rb-reader-body")?.hasAttribute("inert")).toBe(true);

    fireEvent.load(iframe);
    expect(shadow.querySelector(".rb-feedback-loading")).toBeNull();
    expect(iframe.dataset.state).toBe("loaded");
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(modal.querySelector('[aria-label="Close feedback form"]')!);
    await act(async () => Promise.resolve());
    expect(shadow.querySelector("#rb-feedback-dialog")).toBeNull();
    expect(shadow.activeElement).toBe(trigger);
    expect(shadow.querySelector(".rb-content")).toBe(content);
  });

  it("closes with Escape or Close, restores focus, and remains available in Focus mode", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    fireEvent.click(button(shadow, "Focus"));
    const trigger = openFeedbackModal(shadow);

    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-mode")).toBe("focus");
    expect(shadow.querySelector("#rb-feedback-dialog")).not.toBeNull();
    expect(shadow.activeElement).toBe(shadow.querySelector('[aria-label="Close feedback form"]'));

    fireEvent.keyDown(window, { key: "Escape" });
    await act(async () => Promise.resolve());
    expect(shadow.querySelector("#rb-feedback-dialog")).toBeNull();
    expect(shadow.activeElement).toBe(trigger);
    expect(document.getElementById(READER_HOST_ID)).not.toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(shadow.querySelector('[aria-label="Close feedback form"]')!);
    await act(async () => Promise.resolve());
    expect(shadow.querySelector("#rb-feedback-dialog")).toBeNull();
    expect(shadow.activeElement).toBe(trigger);
  });

  it("shows a failure fallback that opens only the exact Tally URL in a new tab", async () => {
    vi.useFakeTimers();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    openFeedbackModal(shadow);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(shadow.querySelector(".rb-feedback-failure")?.textContent).toContain(
      "The feedback form could not be displayed.",
    );
    const fallback = button(shadow, "Open feedback form in a new tab");
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(fallback);

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer");
    expect(open.mock.calls[0][0]).not.toContain("private-conversation-id");
    expect(open.mock.calls[0][0]).not.toContain("Private");
    expect(document.getElementById(READER_HOST_ID)).not.toBeNull();
  });

  it("traps focus in the failed modal and keeps the dialog usable in a narrow layout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    openFeedbackModal(shadow);
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    const close = shadow.querySelector<HTMLButtonElement>('[aria-label="Close feedback form"]')!;
    const fallback = button(shadow, "Open feedback form in a new tab");

    close.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(shadow.activeElement).toBe(fallback);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(shadow.activeElement).toBe(close);
    expect(shadow.querySelector('.rb-reader-body[data-narrow="true"]')).not.toBeNull();
    expect(shadow.querySelector(".rb-feedback-overlay")).not.toBeNull();
  });
});
