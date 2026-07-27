import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";
import { SECTION_TITLE_OVERRIDES_STORAGE_KEY } from "../src/shared/sectionTitleOverrides";

const FIXTURE = readFileSync("tests/fixtures/claude-conversation.html", "utf8");

function conversation() {
  const source = new DOMParser().parseFromString(FIXTURE, "text/html");
  return new ClaudeAdapter(
    source,
    "claude.ai",
    "https://claude.ai/chat/fixture-claude-conversation",
  ).getConversationDocument()!;
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function button(shadow: ShadowRoot, text: string): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === text,
  )!;
}

describe("Claude shared reader integration", () => {
  it("uses Document, Focus, outline, table, code, artifact document, and prompt components", async () => {
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();

    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-outline-group")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-prompt-disclosure")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(2);
    expect(shadow.querySelectorAll(".rb-document-block")).toHaveLength(1);
    expect(shadow.querySelector('.rb-document-block [aria-label="Copy document"]')).not.toBeNull();
    fireEvent.click(
      shadow.querySelector('[aria-label="Expand headings for Claude adapter overview"]')!,
    );
    expect(shadow.querySelector(".rb-outline")?.textContent).toContain("Artifact findings");

    fireEvent.click(button(shadow, "Focus"));
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Response 3 of 3");
    fireEvent.click(shadow.querySelector('[aria-label="Show previous assistant response"]')!);
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Response 2 of 3");
    expect(shadow.querySelector(".rb-content")?.textContent).toContain(
      "The code artifact follows.",
    );
  });

  it("refreshes through the shared merge path without duplicating Claude responses", async () => {
    const source = conversation();
    const refresh = vi.fn().mockResolvedValue({
      document: source,
      scanPerformed: false,
      completed: false,
      terminationReason: "single-snapshot",
    });
    await act(async () => mountReader(source, undefined, refresh));
    await act(async () => Promise.resolve());
    const shadow = shadowRoot();

    expect(refresh).toHaveBeenCalledOnce();
    fireEvent.click(button(shadow, "Actions"));
    fireEvent.click(button(shadow, "Refresh conversation"));
    await act(async () => Promise.resolve());
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(3);
    expect(shadow.querySelectorAll(".rb-document-block")).toHaveLength(1);
  });

  it("persists a renamed section under Claude conversation and message identities", async () => {
    const values: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: values[key] })),
          set: vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update)),
        },
      },
    });
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    fireEvent.click(
      shadow.querySelector('[aria-label="Rename section “Claude adapter overview”"]')!,
    );
    const input = shadow.querySelector<HTMLInputElement>("[data-rb-section-title-editor] input")!;
    fireEvent.change(input, { target: { value: "Claude custom section" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });

    expect(shadow.querySelectorAll(".rb-outline-group-link")[0].textContent).toBe(
      "Claude custom section",
    );
    const payload = JSON.stringify(values[SECTION_TITLE_OVERRIDES_STORAGE_KEY]);
    expect(payload).toContain("claude:fixture-claude-conversation");
    expect(payload).toContain("claude:claude-assistant-1");
    expect(payload).not.toContain("semantic structure");
  });
});
