import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { sanitizeResponseHtml } from "../src/content/sanitize";
import { mountReader, READER_HOST_ID, unmountReader } from "../src/reader/mountReader";
import { STICKER_STORAGE_KEY, normalizeStickerStore } from "../src/shared/stickers";
import type {
  ConversationDocument,
  ConversationScanResult,
  DocumentContentBlock,
} from "../src/shared/types";

const PRINT_CSS = readFileSync("src/reader/reader.print.css", "utf8");
const READER_CSS = readFileSync("src/reader/reader.css", "utf8");

function block(
  id: string,
  role: "user" | "assistant",
  sourceHtml: string,
  platform: ConversationDocument["source"] = "chatgpt",
  conversationId = "sticker-reader",
): DocumentContentBlock {
  const source = document.createElement("div");
  source.innerHTML = sourceHtml;
  const sanitized = sanitizeResponseHtml(source, id);
  return {
    id,
    role,
    ...sanitized,
    provenance: {
      kind: "original",
      platform,
      sourceUrl: `https://example.invalid/${platform}/${conversationId}`,
      sourceConversationId: conversationId,
      sourceMessageId: id,
      extractedAt: "2026-07-21T13:00:00.000Z",
      contentFingerprint: `fingerprint-${id}`,
    },
  };
}

function conversation(
  platform: ConversationDocument["source"] = "chatgpt",
  conversationId = "sticker-reader",
  numbers: readonly number[] = [1, 2],
): ConversationDocument {
  return {
    id: `${platform}-${conversationId}`,
    source: platform,
    title: "Sticker reader fixture",
    sourceUrl: `https://example.invalid/${platform}/${conversationId}`,
    extractedAt: "2026-07-21T13:00:00.000Z",
    turns: numbers.map((number, index) => ({
      id: `turn-${number}`,
      index,
      prompt: block(
        `prompt-${number}`,
        "user",
        `<p>Prompt ${number}</p>`,
        platform,
        conversationId,
      ),
      response: block(
        `response-${number}`,
        "assistant",
        `<h2>Section ${number}</h2><p>Response ${number}</p>`,
        platform,
        conversationId,
      ),
    })),
  };
}

function conversationWithoutSourceMessageIds(
  platform: "chatgpt" | "gemini" | "mistral",
  conversationId: string,
): ConversationDocument {
  const current = conversation(platform, conversationId, [1, 2]);
  return {
    ...current,
    turns: current.turns.map((turn) => ({
      ...turn,
      prompt: turn.prompt
        ? {
            ...turn.prompt,
            provenance: { ...turn.prompt.provenance, sourceMessageId: undefined },
          }
        : null,
      response: turn.response
        ? {
            ...turn.response,
            provenance: { ...turn.response.provenance, sourceMessageId: undefined },
          }
        : null,
    })),
  };
}

function scanResult(document: ConversationDocument): ConversationScanResult {
  return {
    document,
    scanPerformed: true,
    completed: true,
    terminationReason: "bottom",
  };
}

function storage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (update: Record<string, unknown>) => Object.assign(values, update));
  vi.stubGlobal("chrome", { storage: { local: { get, set } } });
  return { values, get, set };
}

function shadowRoot(): ShadowRoot {
  return document.getElementById(READER_HOST_ID)!.shadowRoot!;
}

function modeButton(shadow: ShadowRoot, label: "Document" | "Focus"): HTMLButtonElement {
  return Array.from(shadow.querySelectorAll<HTMLButtonElement>(".rb-mode-switch button")).find(
    (button) => button.textContent === label,
  )!;
}

function stickerMenuItem(shadow: ShadowRoot, label: string): HTMLButtonElement {
  return Array.from(
    shadow.querySelectorAll<HTMLButtonElement>('.rb-sticker-menu [role="menuitem"]'),
  ).find((button) => button.textContent === label)!;
}

async function addSticker(shadow: ShadowRoot, sectionId: string, text: string): Promise<void> {
  fireEvent.click(
    Array.from(shadow.querySelectorAll<HTMLButtonElement>("[data-rb-sticker-anchor]")).find(
      (button) => button.dataset.rbStickerAnchor === sectionId,
    )!,
  );
  const editor = shadow.querySelector<HTMLTextAreaElement>(".rb-sticker-editor textarea")!;
  expect(shadow.activeElement).toBe(editor);
  fireEvent.change(editor, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(editor, { key: "Enter", code: "Enter", ctrlKey: true });
    await Promise.resolve();
  });
}

describe("reader Stickers integration", () => {
  it("renders the complete action menu in a Reader-level overlay and restores focus on Escape", async () => {
    storage();
    await act(async () => mountReader(conversation("chatgpt", "sticker-menu", [1])));
    const shadow = shadowRoot();
    const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;
    await addSticker(
      shadow,
      section.id,
      "A long review note that keeps the expanded card useful while its independent action menu remains fully visible.",
    );

    const card = section.querySelector<HTMLElement>(".rb-sticker--expanded")!;
    const trigger = card.querySelector<HTMLButtonElement>(".rb-sticker-menu-trigger")!;
    fireEvent.click(trigger);

    let menu = shadow.querySelector<HTMLElement>('.rb-sticker-menu[role="menu"]')!;
    expect(
      Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'), (item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(["Edit", "Collapse", "Pin", "Delete"]);
    expect(
      Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).every(
        (item) => item.classList.contains("rb-sticker-menu-item") && !item.disabled,
      ),
    ).toBe(true);
    expect(stickerMenuItem(shadow, "Edit").classList).not.toContain("rb-sticker-menu-delete");
    expect(stickerMenuItem(shadow, "Collapse").classList).not.toContain("rb-sticker-menu-delete");
    expect(stickerMenuItem(shadow, "Pin").classList).not.toContain("rb-sticker-menu-delete");
    expect(stickerMenuItem(shadow, "Delete").classList).toContain("rb-sticker-menu-delete");
    expect(card.contains(menu)).toBe(false);
    expect(menu.parentElement?.getAttribute("data-rb-sticker-menu-portal")).toBe("true");
    expect(menu.closest(".rb-reader")).not.toBeNull();
    expect(shadow.activeElement?.textContent).toBe("Edit");

    fireEvent.click(stickerMenuItem(shadow, "Pin"));
    fireEvent.click(trigger);
    menu = shadow.querySelector<HTMLElement>('.rb-sticker-menu[role="menu"]')!;
    expect(stickerMenuItem(shadow, "Unpin")).not.toBeNull();

    await act(async () => {
      fireEvent.keyDown(menu, { key: "Escape", code: "Escape" });
      await Promise.resolve();
    });
    expect(shadow.querySelector(".rb-sticker-menu")).toBeNull();
    expect(shadow.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    expect(READER_CSS).toMatch(/\.rb-sticker-menu\s*{[^}]*position:\s*fixed/s);
    expect(READER_CSS).toMatch(/\.rb-sticker-menu\s*{[^}]*min-width:\s*11rem/s);
    expect(READER_CSS).toMatch(/\.rb-sticker-menu > button\s*{[^}]*min-height:\s*38px/s);
    expect(READER_CSS).toMatch(
      /\.rb-sticker-menu \.rb-sticker-menu-item\s*{[^}]*color:\s*var\(--rb-text\)[^}]*opacity:\s*1/s,
    );
    expect(READER_CSS).toMatch(/\.rb-sticker-menu-portal\s*{[^}]*position:\s*fixed/s);
  });

  it("creates, edits, moves, collapses, renames, filters, restores, and deletes stickers", async () => {
    const backend = storage();
    await act(async () => mountReader(conversation()));
    let shadow = shadowRoot();
    const sectionIds = Array.from(
      shadow.querySelectorAll<HTMLElement>(".rb-document-section"),
      (section) => section.id,
    );

    expect(shadow.querySelectorAll("[data-rb-sticker-anchor]")).toHaveLength(2);
    expect(shadow.querySelector(`[aria-label="Add sticker to section: Section 1"]`)).not.toBeNull();

    await addSticker(shadow, sectionIds[0], "Important for the exam");
    await addSticker(shadow, sectionIds[1], "Verify this claim");
    await vi.waitFor(() =>
      expect(normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries).toHaveLength(2),
    );

    let cards = shadow.querySelectorAll<HTMLElement>("[data-rb-sticker-id]");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("Important for the exam");
    expect(cards[1].textContent).toContain("Verify this claim");
    expect(shadow.querySelectorAll(".rb-sticker--expanded")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-sticker--collapsed")).toHaveLength(1);
    expect(cards[1].classList.contains("rb-sticker--expanded")).toBe(true);

    const secondMove = cards[1].querySelector<HTMLButtonElement>(".rb-sticker-drag")!;
    vi.spyOn(cards[1].parentElement!, "getBoundingClientRect").mockReturnValue({
      height: 600,
    } as DOMRect);
    const originalY = Number(cards[1].dataset.rbStickerYRatio);
    fireEvent.keyDown(secondMove, { key: "ArrowDown" });
    await vi.waitFor(() => expect(cards[1].querySelector('[aria-label="Pinned"]')).not.toBeNull());
    await vi.waitFor(() => {
      const moved = normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries.find(
        (sticker) => sticker.text === "Verify this claim",
      )!;
      expect(moved.isPinned).toBe(true);
      expect(moved.position.yRatio).toBeGreaterThan(originalY);
    });

    fireEvent.click(cards[1].querySelector(".rb-sticker-menu-trigger")!);
    fireEvent.click(stickerMenuItem(shadow, "Collapse"));
    expect(cards[1].classList.contains("rb-sticker--collapsed")).toBe(true);

    fireEvent.click(
      shadow.querySelector<HTMLButtonElement>('[aria-label="Rename section “Section 2”"]')!,
    );
    const titleInput = shadow.querySelector<HTMLInputElement>(
      "[data-rb-section-title-editor] input",
    )!;
    fireEvent.change(titleInput, { target: { value: "Renamed review section" } });
    await act(async () => {
      fireEvent.keyDown(titleInput, { key: "Enter", code: "Enter" });
      await Promise.resolve();
    });
    expect(
      shadow.querySelector('[aria-label="Sticker attached to section: Renamed review section"]'),
    ).not.toBeNull();
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(2);

    fireEvent.click(modeButton(shadow, "Focus"));
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(1);
    expect(shadow.querySelector("[data-rb-sticker-id]")?.textContent).toContain(
      "Verify this claim",
    );
    fireEvent.click(shadow.querySelector('[aria-label="Show previous assistant response"]')!);
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(1);
    expect(shadow.querySelector("[data-rb-sticker-id]")?.textContent).toContain(
      "Important for the exam",
    );
    fireEvent.click(modeButton(shadow, "Document"));
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(2);

    await act(async () => unmountReader());
    await act(async () => mountReader(conversation()));
    shadow = shadowRoot();
    cards = shadow.querySelectorAll<HTMLElement>("[data-rb-sticker-id]");
    expect(cards).toHaveLength(2);
    expect(shadow.textContent).toContain("Important for the exam");
    expect(shadow.textContent).toContain("Verify this claim");

    const restoredScrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    vi.spyOn(restoredScrollArea, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 700,
      height: 600,
    } as DOMRect);
    vi.spyOn(cards[0], "getBoundingClientRect").mockReturnValue({
      top: 900,
      bottom: 940,
      height: 40,
    } as DOMRect);
    vi.spyOn(cards[1], "getBoundingClientRect").mockReturnValue({
      top: 300,
      bottom: 340,
      height: 40,
    } as DOMRect);
    await act(async () => {
      fireEvent.scroll(restoredScrollArea);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await vi.waitFor(() =>
      expect(shadow.querySelector('[data-rb-sticker-navigation="below"]')?.textContent).toContain(
        "1",
      ),
    );

    const cardToDelete = Array.from(cards).find((card) =>
      card.textContent?.includes("Important for the exam"),
    )!;
    fireEvent.click(cardToDelete.querySelector(".rb-sticker-collapsed-content")!);
    expect(shadow.querySelectorAll(".rb-sticker--expanded")).toHaveLength(1);
    fireEvent.click(cardToDelete.querySelector(".rb-sticker-menu-trigger")!);
    fireEvent.click(stickerMenuItem(shadow, "Delete"));
    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>(".rb-sticker-menu button")).find(
        (button) => button.textContent === "Delete",
      )!,
    );
    await vi.waitFor(() =>
      expect(normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries).toHaveLength(1),
    );
    await vi.waitFor(() =>
      expect(shadow.querySelector('[data-rb-sticker-navigation="below"]')).toBeNull(),
    );

    await act(async () => unmountReader());
    await act(async () => mountReader(conversation()));
    shadow = shadowRoot();
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(1);
    expect(shadow.textContent).not.toContain("Important for the exam");
    expect(shadow.textContent).toContain("Verify this claim");
  });

  it("navigates to the nearest rendered Sticker and scopes counts to the active mode", async () => {
    storage();
    await act(async () => mountReader(conversation("gemini", "sticker-navigation", [1, 2, 3])));
    const shadow = shadowRoot();
    const sections = Array.from(shadow.querySelectorAll<HTMLElement>(".rb-document-section"));
    await addSticker(shadow, sections[0].id, "Upper note");
    await addSticker(shadow, sections[1].id, "Visible note");
    await addSticker(shadow, sections[2].id, "Lower note");
    const expanded = shadow.querySelector<HTMLElement>(".rb-sticker--expanded")!;
    fireEvent.click(expanded.querySelector(".rb-sticker-menu-trigger")!);
    fireEvent.click(stickerMenuItem(shadow, "Collapse"));

    const scrollArea = shadow.querySelector<HTMLElement>(".rb-scroll-area")!;
    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 2400 },
      scrollTop: { configurable: true, value: 600, writable: true },
    });
    vi.spyOn(scrollArea, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 700,
      height: 600,
    } as DOMRect);
    const cards = Array.from(shadow.querySelectorAll<HTMLElement>("[data-rb-sticker-id]"));
    vi.spyOn(cards[0], "getBoundingClientRect").mockReturnValue({
      top: 20,
      bottom: 60,
      height: 40,
    } as DOMRect);
    vi.spyOn(cards[1], "getBoundingClientRect").mockReturnValue({
      top: 300,
      bottom: 340,
      height: 40,
    } as DOMRect);
    vi.spyOn(cards[2], "getBoundingClientRect").mockReturnValue({
      top: 900,
      bottom: 940,
      height: 40,
    } as DOMRect);
    const scrollTo = vi.fn();
    Object.defineProperty(scrollArea, "scrollTo", { configurable: true, value: scrollTo });

    await act(async () => {
      fireEvent.scroll(scrollArea);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await vi.waitFor(() => {
      expect(shadow.querySelector('[data-rb-sticker-navigation="above"]')?.textContent).toContain(
        "1",
      );
      expect(shadow.querySelector('[data-rb-sticker-navigation="below"]')?.textContent).toContain(
        "1",
      );
    });

    const down = shadow.querySelector<HTMLButtonElement>('[data-rb-sticker-navigation="below"]')!;
    expect(down.getAttribute("aria-label")).toBe("Go to nearest Sticker below. 1 Sticker below.");
    fireEvent.click(down);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1120, behavior: "smooth" });
    expect(cards[2].dataset.rbStickerHighlighted).toBe("true");
    expect(shadow.textContent).toContain("Moved to Sticker in section “Section 3”.");

    fireEvent.click(modeButton(shadow, "Focus"));
    await vi.waitFor(() => expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(1));
    expect(shadow.querySelector(".rb-focus-section")?.getAttribute("data-rb-section-id")).toBe(
      sections[2].id,
    );
    const focusedCard = shadow.querySelector<HTMLElement>("[data-rb-sticker-id]")!;
    vi.spyOn(focusedCard, "getBoundingClientRect").mockReturnValue({
      top: 300,
      bottom: 340,
      height: 40,
    } as DOMRect);
    await act(async () => {
      fireEvent.scroll(scrollArea);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    await vi.waitFor(() =>
      expect(shadow.querySelector('[data-rb-sticker-navigation="above"]')).toBeNull(),
    );
  });

  it.each(["chatgpt", "gemini", "mistral"] as const)(
    "scopes persisted stickers to a stable %s conversation and response identity",
    async (platform) => {
      const backend = storage();
      await act(async () => mountReader(conversation(platform, `${platform}-stickers`)));
      const shadow = shadowRoot();
      const firstSection = shadow.querySelector<HTMLElement>(".rb-document-section")!;
      await addSticker(shadow, firstSection.id, `${platform} private note`);
      await vi.waitFor(() => expect(backend.values[STICKER_STORAGE_KEY]).toBeDefined());
      const [stored] = normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries;
      expect(stored.conversationKey).toBe(`${platform}:${platform}-stickers`);
      expect(stored.sectionKey).toBe(`${platform}:response-1`);
    },
  );

  it.each(["chatgpt", "gemini", "mistral"] as const)(
    "restores a %s Sticker after a full Reader remount when the source message ID is absent",
    async (platform) => {
      const backend = storage();
      const current = conversationWithoutSourceMessageIds(platform, `${platform}-fallback`);
      await act(async () => mountReader(current));
      let shadow = shadowRoot();
      const firstSection = shadow.querySelector<HTMLElement>(".rb-document-section")!;
      await addSticker(shadow, firstSection.id, `${platform} fallback note`);
      await vi.waitFor(() => {
        const [stored] = normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries;
        expect(stored.sectionKey).toContain(`${platform}:fingerprint:`);
      });

      await act(async () => unmountReader());
      const reconstructed = conversationWithoutSourceMessageIds(platform, `${platform}-fallback`);
      await act(async () => mountReader(reconstructed));
      shadow = shadowRoot();
      expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(1);
      expect(shadow.textContent).toContain(`${platform} fallback note`);
    },
  );

  it("shows a visible warning when a Sticker storage write fails", async () => {
    const backend = storage();
    backend.set.mockRejectedValueOnce(new Error("storage unavailable"));
    await act(async () => mountReader(conversation("gemini", "storage-failure", [1])));
    const shadow = shadowRoot();
    const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;
    await addSticker(shadow, section.id, "Keep this in memory");

    await vi.waitFor(() =>
      expect(shadow.querySelector(".rb-sticker-status")?.textContent).toBe(
        "Your Sticker could not be saved locally. Keep ReadBooster open and try again.",
      ),
    );
    expect(shadow.textContent).toContain("Keep this in memory");
  });

  it("flushes a pending explicit save before the Reader closes and restores it on reopen", async () => {
    const backend = storage();
    await act(async () => mountReader(conversation("chatgpt", "close-flush", [1])));
    const shadow = shadowRoot();
    const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;
    let releaseWrite: (() => void) | undefined;
    backend.set.mockImplementationOnce(
      (update: Record<string, unknown>) =>
        new Promise<Record<string, unknown>>((resolve) => {
          releaseWrite = () => {
            Object.assign(backend.values, update);
            resolve(backend.values);
          };
        }),
    );

    await addSticker(shadow, section.id, "Survive an immediate close");
    await vi.waitFor(() => expect(releaseWrite).toBeTypeOf("function"));
    fireEvent.click(shadow.querySelector('[aria-label="Close reader"]')!);
    expect(document.getElementById(READER_HOST_ID)).not.toBeNull();

    releaseWrite!();
    await vi.waitFor(() => expect(document.getElementById(READER_HOST_ID)).toBeNull());
    await act(async () => mountReader(conversation("chatgpt", "close-flush", [1])));
    expect(shadowRoot().textContent).toContain("Survive an immediate close");
  });

  it("keeps one stable sticker on its response when refresh inserts earlier and later sections", async () => {
    storage();
    const initial = conversation("chatgpt", "refresh-stickers", [1, 2]);
    const expanded = conversation("chatgpt", "refresh-stickers", [0, 1, 2, 3]);
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(scanResult(initial))
      .mockResolvedValueOnce(scanResult(expanded));
    await act(async () => mountReader(initial, undefined, refresh));
    const shadow = shadowRoot();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const secondSection = Array.from(
      shadow.querySelectorAll<HTMLElement>(".rb-document-section"),
    ).find((section) => section.dataset.rbResponseId === "response-2")!;
    await addSticker(shadow, secondSection.id, "Stay with response two");

    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Actions",
      )!,
    );
    await act(async () => {
      fireEvent.click(
        Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
          (button) => button.textContent === "Refresh conversation",
        )!,
      );
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(4));
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(1);
    const responseTwo = shadow.querySelector<HTMLElement>('[data-rb-response-id="response-2"]')!;
    expect(responseTwo.querySelector("[data-rb-sticker-id]")?.textContent).toContain(
      "Stay with response two",
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("removes an abandoned empty draft, keeps sticker content out of Copy, and hides stickers in print", async () => {
    storage();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const firstSection = shadow.querySelector<HTMLElement>(".rb-document-section")!;
    fireEvent.click(shadow.querySelector(`[data-rb-sticker-anchor="${firstSection.id}"]`)!);
    const editor = shadow.querySelector<HTMLTextAreaElement>(".rb-sticker-editor textarea")!;
    fireEvent.keyDown(editor, { key: "Escape", code: "Escape" });
    expect(shadow.querySelectorAll("[data-rb-sticker-id]")).toHaveLength(0);

    await addSticker(shadow, firstSection.id, "Do not copy this private sticker");
    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Actions",
      )!,
    );
    await act(async () => {
      fireEvent.click(shadow.querySelector('[aria-label="Copy conversation document"]')!);
      await Promise.resolve();
    });
    expect(String(writeText.mock.calls[0][0])).not.toContain("Do not copy this private sticker");
    expect(PRINT_CSS).toContain(".rb-sticker-layer");
    expect(PRINT_CSS).toContain(".rb-sticker-anchor");
  });

  it("keeps the original reading column while outline and reading settings change", async () => {
    storage();
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;
    const content = section.querySelector<HTMLElement>(".rb-content")!;
    await addSticker(shadow, section.id, "Secondary note");
    const sticker = section.querySelector<HTMLElement>("[data-rb-sticker-id]")!;

    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Hide outline",
      )!,
    );
    expect(shadow.querySelector(".rb-reader-body")?.getAttribute("data-outline-open")).toBe(
      "false",
    );
    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Outline",
      )!,
    );

    fireEvent.click(
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === "Reading settings",
      )!,
    );
    fireEvent.change(shadow.querySelector('[aria-label="Reader text size"]')!, {
      target: { value: "x-large" },
    });
    fireEvent.change(shadow.querySelector('[aria-label="Reader spacing"]')!, {
      target: { value: "roomy" },
    });
    fireEvent.change(shadow.querySelector('[aria-label="Reading style"]')!, {
      target: { value: "serif" },
    });

    expect(section.querySelector(".rb-content")).toBe(content);
    expect(section.querySelector("[data-rb-sticker-id]")).toBe(sticker);
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-reading-style")).toBe("serif");
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-text-size")).toBe("x-large");
    expect(shadow.querySelector(".rb-reader")?.getAttribute("data-spacing")).toBe("roomy");
    expect(READER_CSS).toMatch(/\.rb-document-section\s*{[^}]*container-type:\s*inline-size/s);
    expect(READER_CSS).not.toMatch(/\.rb-document-section\s*{[^}]*grid-template-columns/s);
    expect(READER_CSS).toMatch(/\.rb-sticker-layer\s*{[^}]*position:\s*absolute/s);
    expect(READER_CSS).toMatch(/\.rb-sticker--collapsed\s*{[^}]*width:\s*40px/s);
    expect(READER_CSS).toMatch(
      /@container \(max-width: 68rem\)[\s\S]*\.rb-sticker--expanded\s*{[\s\S]*position:\s*fixed/,
    );
  });

  it("stacks collapsed margin pins and expands only one floating card", async () => {
    storage();
    await act(async () => mountReader(conversation()));
    const shadow = shadowRoot();
    const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;

    await addSticker(shadow, section.id, "First note");
    await addSticker(shadow, section.id, "Second note");
    await addSticker(shadow, section.id, "Third note");

    expect(section.querySelectorAll(".rb-sticker--expanded")).toHaveLength(1);
    let collapsed = Array.from(section.querySelectorAll<HTMLElement>(".rb-sticker--collapsed"));
    expect(collapsed).toHaveLength(2);
    expect(collapsed.map((card) => Number(card.dataset.rbStickerYRatio))).toEqual(
      expect.arrayContaining([expect.any(Number), expect.any(Number)]),
    );
    expect(collapsed.every((card) => Number(card.dataset.rbStickerYRatio) >= 88 / 560)).toBe(true);
    expect(collapsed[0].querySelector("[data-rb-sticker-note-icon]")).not.toBeNull();
    expect(collapsed[0].querySelector(".rb-sticker-saved-dot")).not.toBeNull();
    expect(
      collapsed[0].querySelector(".rb-sticker-collapsed-content")?.getAttribute("aria-label"),
    ).toContain("Open sticker attached to");

    const expanded = section.querySelector<HTMLElement>(".rb-sticker--expanded")!;
    fireEvent.click(expanded.querySelector(".rb-sticker-menu-trigger")!);
    fireEvent.click(stickerMenuItem(shadow, "Collapse"));

    expect(section.querySelectorAll(".rb-sticker--expanded")).toHaveLength(0);
    collapsed = Array.from(section.querySelectorAll<HTMLElement>(".rb-sticker--collapsed"));
    expect(collapsed).toHaveLength(3);
    const yPositions = collapsed.map((card) => Number(card.dataset.rbStickerYRatio) * 560);
    expect(yPositions[0]).toBeGreaterThanOrEqual(88);
    expect(yPositions[1] - yPositions[0]).toBeGreaterThanOrEqual(48);
    expect(yPositions[2] - yPositions[1]).toBeGreaterThanOrEqual(48);
    expect(section.querySelector(".rb-sticker-drawer-backdrop")).toBeNull();
  });

  it("drags a collapsed pin vertically, persists its section ratio, and keeps ownership", async () => {
    const backend = storage();
    await act(async () => mountReader(conversation("gemini", "drag-sticker", [1])));
    let shadow = shadowRoot();
    const section = shadow.querySelector<HTMLElement>(".rb-document-section")!;
    await addSticker(shadow, section.id, "Place beside this paragraph");

    const expanded = section.querySelector<HTMLElement>(".rb-sticker--expanded")!;
    fireEvent.click(expanded.querySelector(".rb-sticker-menu-trigger")!);
    fireEvent.click(stickerMenuItem(shadow, "Collapse"));

    const card = section.querySelector<HTMLElement>(".rb-sticker--collapsed")!;
    const layer = card.parentElement!;
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({ height: 600 } as DOMRect);
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue({ height: 40 } as DOMRect);
    const pin = card.querySelector<HTMLButtonElement>(".rb-sticker-collapsed-content")!;
    pin.setPointerCapture = vi.fn();
    const originalRatio = Number(card.dataset.rbStickerYRatio);

    fireEvent.pointerDown(pin, { button: 0, clientY: 150, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 250, pointerId: 1 });
    await act(async () => {
      fireEvent.pointerUp(window, { clientY: 250, pointerId: 1 });
      await Promise.resolve();
    });

    expect(section.querySelectorAll(".rb-sticker--expanded")).toHaveLength(0);
    await vi.waitFor(() => {
      const [stored] = normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries;
      expect(stored.position.yRatio).toBeGreaterThan(originalRatio);
      expect(stored.conversationKey).toBe("gemini:drag-sticker");
      expect(stored.sectionKey).toBe("gemini:response-1");
    });
    const storedRatio = normalizeStickerStore(backend.values[STICKER_STORAGE_KEY]).entries[0]
      .position.yRatio;

    await act(async () => unmountReader());
    await act(async () => mountReader(conversation("gemini", "drag-sticker", [1])));
    shadow = shadowRoot();
    const restored = shadow.querySelector<HTMLElement>(".rb-sticker--collapsed")!;
    expect(Number(restored.dataset.rbStickerYRatio)).toBeCloseTo(storedRatio, 5);
  });
});
