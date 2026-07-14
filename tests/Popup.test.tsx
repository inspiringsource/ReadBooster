import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContentResponse } from "../src/content/messages";
import { Popup } from "../src/popup/Popup";

function installChromeMock(url: string, getResponse: (type: string) => ContentResponse | null) {
  const sendMessage = vi.fn(
    (_tabId: number, request: { type: string }, callback: (response: ContentResponse) => void) => {
      const response = getResponse(request.type);
      if (response) {
        callback(response);
      }
    },
  );
  vi.stubGlobal("chrome", {
    tabs: {
      query: vi.fn(async () => [{ id: 7, url }]),
      sendMessage,
    },
    runtime: { lastError: undefined },
  });
  return sendMessage;
}

describe("Popup", () => {
  it.each([
    ["Claude", "https://claude.ai/chat/1", "claude" as const],
    ["Gemini", "https://gemini.google.com/app/1", "gemini" as const],
  ])("shows %s as not implemented and disables optimization", async (name, url, source) => {
    installChromeMock(url, () => ({
      ok: true,
      supported: true,
      source,
      implemented: false,
      manuallyVerified: false,
      canExtractResponses: false,
      responseAvailable: false,
    }));

    render(<Popup />);

    expect(await screen.findByText(`${name} support is not yet implemented.`)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Optimize latest response" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
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
      (_tabId, _request, callback: (response: ContentResponse) => void) => {
        finishOptimization = callback;
      },
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
