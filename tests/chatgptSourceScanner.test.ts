import { describe, expect, it, vi } from "vitest";

import {
  findChatGPTConversationScroller,
  waitForChatGPTDomToSettle,
} from "../src/content/adapters/chatgptSourceScanner";

function scrollingDimensions(
  element: HTMLElement,
  scrollHeight: number,
  clientHeight: number,
): void {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: scrollHeight },
    clientHeight: { configurable: true, value: clientHeight },
  });
}

describe("ChatGPT source-scroller selection and settling", () => {
  it("selects the scrollable ancestor containing mounted turns, not the reader or sidebar", () => {
    document.body.innerHTML = `
      <aside id="sidebar"><div></div></aside>
      <main><div id="conversation-source" style="overflow-y:auto">
        <article data-message-author-role="user"></article>
        <article data-message-author-role="assistant"></article>
      </div></main>
      <div id="readbooster-reader-root"><div class="rb-scroll-area"></div></div>
    `;
    const source = document.querySelector<HTMLElement>("#conversation-source")!;
    const sidebar = document.querySelector<HTMLElement>("#sidebar")!;
    const reader = document.querySelector<HTMLElement>(".rb-scroll-area")!;
    scrollingDimensions(source, 4_000, 800);
    scrollingDimensions(sidebar, 5_000, 600);
    scrollingDimensions(reader, 6_000, 700);
    const candidates = Array.from(
      source.querySelectorAll<HTMLElement>("[data-message-author-role]"),
    );

    expect(findChatGPTConversationScroller(document, candidates)).toBe(source);
  });

  it("falls back safely when no validated conversation scroller exists", () => {
    document.body.innerHTML =
      '<main><article data-message-author-role="assistant"></article></main>';
    const candidate = document.querySelector<HTMLElement>("article")!;
    expect(findChatGPTConversationScroller(document, [candidate])).toBeNull();
  });

  it("disconnects its scoped observer and cancels frames when aborted", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const disconnect = vi.fn();
    const observe = vi.fn();
    class TestMutationObserver {
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal("MutationObserver", TestMutationObserver);
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 41);
    const cancelAnimationFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, "removeEventListener");
    const clearTimeout = vi.spyOn(window, "clearTimeout");
    const settled = waitForChatGPTDomToSettle(container, controller.signal);

    controller.abort();

    await expect(settled).rejects.toMatchObject({ name: "AbortError" });
    expect(observe).toHaveBeenCalledWith(container, { childList: true, subtree: true });
    expect(disconnect).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
    expect(clearTimeout).toHaveBeenCalled();
    expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
