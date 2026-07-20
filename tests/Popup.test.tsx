import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContentResponse } from "../src/content/messages";
import { Popup } from "../src/popup/Popup";

function installChromeMock(url: string, getResponse: (type: string) => ContentResponse | null) {
  const sendMessage = vi.fn(async (_tabId: number, request: { type: string }) =>
    getResponse(request.type),
  );
  vi.stubGlobal("chrome", {
    tabs: {
      query: vi.fn(async () => [{ id: 7, url }]),
      sendMessage,
    },
    runtime: {},
  });
  return sendMessage;
}

describe("Popup", () => {
  it("shows compact branded artwork without changing unsupported-page behavior", async () => {
    installChromeMock("https://example.com/", () => null);

    const { container } = render(<Popup />);

    expect(await screen.findByText("This page is not supported.")).toBeTruthy();
    const icon = container.querySelector<HTMLImageElement>(".popup-brand img")!;
    expect(icon.getAttribute("src")).toBe("/icons/readbooster-32.png");
    expect(icon.getAttribute("alt")).toBe("");
    expect(icon.width).toBe(32);
    expect(icon.height).toBe(32);
    expect(screen.getByText("ReadBooster")).toBeTruthy();
    expect(screen.getByText("ReadBooster processes content locally in your browser.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Optimize latest response" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it.each([
    ["Claude", "https://claude.ai/chat/1"],
    ["Claude subdomain", "https://chat.claude.ai/chat/1"],
    ["Mistral", "https://mistral.ai/"],
  ])("treats %s as unsupported without messaging a content script", async (_name, url) => {
    const sendMessage = installChromeMock(url, () => null);

    render(<Popup />);

    expect(await screen.findByText("This page is not supported.")).toBeTruthy();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Optimize latest response" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("enables optimization for an available Gemini response", async () => {
    const sendMessage = installChromeMock("https://gemini.google.com/app/fixture", () => ({
      ok: true,
      supported: true,
      source: "gemini",
      implemented: true,
      manuallyVerified: false,
      canExtractResponses: true,
      responseAvailable: true,
    }));
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);

    render(<Popup />);

    expect(await screen.findByText("A response is ready to optimize.")).toBeTruthy();
    const optimize = screen.getByRole("button", {
      name: "Optimize latest response",
    }) as HTMLButtonElement;
    expect(optimize.disabled).toBe(false);
    fireEvent.click(optimize);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenLastCalledWith(7, { type: "READBOOSTER_OPTIMIZE_LATEST" });
  });

  it("enables optimization for an available Mistral response", async () => {
    const sendMessage = installChromeMock("https://chat.mistral.ai/work/fixture", () => ({
      ok: true,
      supported: true,
      source: "mistral",
      implemented: true,
      manuallyVerified: false,
      canExtractResponses: true,
      responseAvailable: true,
    }));
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);

    render(<Popup />);

    expect(await screen.findByText("A response is ready to optimize.")).toBeTruthy();
    const optimize = screen.getByRole("button", {
      name: "Optimize latest response",
    }) as HTMLButtonElement;
    expect(optimize.disabled).toBe(false);
    fireEvent.click(optimize);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(sendMessage).toHaveBeenLastCalledWith(7, { type: "READBOOSTER_OPTIMIZE_LATEST" });
  });

  it("prevents duplicate popup optimization while busy", async () => {
    let finishOptimization!: (response: ContentResponse) => void;
    const sendMessage = installChromeMock("https://chatgpt.com/c/1", (type) => {
      if (type === "READBOOSTER_GET_STATUS") {
        return {
          ok: true,
          supported: true,
          source: "chatgpt",
          implemented: true,
          manuallyVerified: false,
          canExtractResponses: true,
          responseAvailable: true,
        };
      }
      return null;
    });
    sendMessage.mockImplementationOnce(sendMessage.getMockImplementation()!);
    sendMessage.mockImplementationOnce(
      () =>
        new Promise<ContentResponse>((resolve) => {
          finishOptimization = resolve;
        }),
    );

    render(<Popup />);
    const button = (await screen.findByRole("button", {
      name: "Optimize latest response",
    })) as HTMLButtonElement;
    await vi.waitFor(() => expect(button.disabled).toBe(false));

    fireEvent.click(button);
    fireEvent.click(button);

    expect(button.disabled).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2); // one status request and one optimize request

    finishOptimization({ ok: false, supported: true, reason: "no-response" });
    expect(await screen.findByText("No assistant response was found on this page.")).toBeTruthy();
  });
});
