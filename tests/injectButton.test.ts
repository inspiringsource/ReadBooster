import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { CONTROL_HOST_ID, injectOptimizeButton } from "../src/content/injectButton";

describe("injectOptimizeButton", () => {
  it("injects one keyboard-accessible control idempotently", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    injectOptimizeButton(document, async () => {
      firstHandler();
      return { ok: true };
    });
    injectOptimizeButton(document, async () => {
      secondHandler();
      return { ok: true };
    });

    const hosts = document.querySelectorAll(`#${CONTROL_HOST_ID}`);
    expect(hosts).toHaveLength(1);

    const button = hosts[0].shadowRoot?.querySelector("button");
    expect(button?.textContent).toBe("Optimize Reading");
    expect(button?.getAttribute("aria-label")).toContain("latest assistant response");
    fireEvent.click(button!);
    expect(firstHandler).toHaveBeenCalledOnce();
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it("prevents duplicate activation while busy and reports a no-response result", async () => {
    let resolveOptimization!: (result: { ok: false; reason: "no-response" }) => void;
    const optimization = new Promise<{ ok: false; reason: "no-response" }>((resolve) => {
      resolveOptimization = resolve;
    });
    const handler = vi.fn(() => optimization);

    injectOptimizeButton(document, handler);
    const host = document.getElementById(CONTROL_HOST_ID)!;
    const button = host.shadowRoot!.querySelector("button")!;
    const status = host.shadowRoot!.querySelector('[role="status"]')!;

    fireEvent.click(button);
    fireEvent.click(button);

    expect(handler).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    resolveOptimization({ ok: false, reason: "no-response" });
    await vi.waitFor(() => expect(status.textContent).toBe("No assistant response found."));
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });
});
