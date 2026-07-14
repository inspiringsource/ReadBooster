import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { CONTROL_HOST_ID, injectOptimizeButton } from "../src/content/injectButton";

describe("injectOptimizeButton", () => {
  it("injects one keyboard-accessible control idempotently", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    injectOptimizeButton(document, firstHandler);
    injectOptimizeButton(document, secondHandler);

    const hosts = document.querySelectorAll(`#${CONTROL_HOST_ID}`);
    expect(hosts).toHaveLength(1);

    const button = hosts[0].shadowRoot?.querySelector("button");
    expect(button?.textContent).toBe("Optimize Reading");
    expect(button?.getAttribute("aria-label")).toContain("latest assistant response");
    fireEvent.click(button!);
    expect(firstHandler).toHaveBeenCalledOnce();
    expect(secondHandler).not.toHaveBeenCalled();
  });
});
