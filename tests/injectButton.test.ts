import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import {
  CONTROL_HOST_ID,
  CONTROL_LAYOUT_EVENT,
  injectOptimizeButton,
} from "../src/content/injectButton";

interface MutableRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

function domRect(rect: MutableRect): DOMRect {
  return {
    ...rect,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  } as DOMRect;
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function installMeasuredComposer(initial: MutableRect) {
  let composerRect = initial;
  let sizerWidth = 164;
  document.body.innerHTML = `
    <form data-test-composer>
      <textarea aria-label="Message"></textarea>
      <button type="button">Send</button>
    </form>`;
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.matches("[data-test-composer], textarea")) {
      return domRect(composerRect);
    }
    if (this.classList.contains("rb-control-sizer")) {
      return domRect({
        top: 0,
        right: sizerWidth,
        bottom: 44,
        left: 0,
        width: sizerWidth,
        height: 44,
      });
    }
    if (this.classList.contains("rb-optimize-button")) {
      const host = (this.getRootNode() as ShadowRoot).host;
      const width = host.getAttribute("data-rb-control-mode") === "compact" ? 44 : 164;
      return domRect({ top: 0, right: width, bottom: 44, left: 0, width, height: 44 });
    }
    return domRect({ top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 });
  });
  return {
    setComposerRect(next: MutableRect) {
      composerRect = next;
    },
    setSizerWidth(next: number) {
      sizerWidth = next;
    },
  };
}

describe("injectOptimizeButton", () => {
  it("injects one keyboard-accessible control idempotently", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const cleanup = injectOptimizeButton(document, async () => {
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
    expect(button?.getAttribute("aria-label")).toBe("Optimize Reading");
    expect(button?.getAttribute("title")).toBe("Optimize Reading");
    expect(button?.querySelector("img")?.getAttribute("src")).toContain("icons/readbooster-32.png");
    fireEvent.click(button!);
    expect(firstHandler).toHaveBeenCalledOnce();
    expect(secondHandler).not.toHaveBeenCalled();
    cleanup();
  });

  it("prevents duplicate activation while busy and reports a no-response result", async () => {
    let resolveOptimization!: (result: { ok: false; reason: "no-response" }) => void;
    const optimization = new Promise<{ ok: false; reason: "no-response" }>((resolve) => {
      resolveOptimization = resolve;
    });
    const handler = vi.fn(() => optimization);

    const cleanup = injectOptimizeButton(document, handler);
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
    cleanup();
  });

  it("switches compact and full without replacing the focused button", async () => {
    FakeResizeObserver.instances = [];
    const geometry = installMeasuredComposer({
      top: 680,
      right: 740,
      bottom: 760,
      left: 140,
      width: 600,
      height: 80,
    });
    const cleanup = injectOptimizeButton(document, async () => ({ ok: true }));
    const host = document.getElementById(CONTROL_HOST_ID)!;
    const button = host.shadowRoot!.querySelector<HTMLButtonElement>("button")!;

    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("full"));
    button.focus();
    geometry.setComposerRect({
      top: 680,
      right: 950,
      bottom: 760,
      left: 150,
      width: 800,
      height: 80,
    });
    FakeResizeObserver.instances[0].trigger();
    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("compact"));
    expect(host.dataset.rbControlPlacement).toBe("above");
    expect(host.shadowRoot!.activeElement).toBe(button);
    expect(document.querySelectorAll(`#${CONTROL_HOST_ID}`)).toHaveLength(1);

    geometry.setComposerRect({
      top: 680,
      right: 690,
      bottom: 760,
      left: 140,
      width: 550,
      height: 80,
    });
    host.dispatchEvent(new Event(CONTROL_LAYOUT_EVENT));
    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("full"));
    expect(host.shadowRoot!.querySelector("button")).toBe(button);

    cleanup();
    expect(FakeResizeObserver.instances[0].disconnect).toHaveBeenCalledOnce();
  });

  it("preserves compact loading, disabled, tooltip, and activation behavior", async () => {
    FakeResizeObserver.instances = [];
    installMeasuredComposer({
      top: 680,
      right: 950,
      bottom: 760,
      left: 150,
      width: 800,
      height: 80,
    });
    let resolve!: (result: { ok: true }) => void;
    const pending = new Promise<{ ok: true }>((done) => {
      resolve = done;
    });
    const handler = vi.fn(() => pending);
    const cleanup = injectOptimizeButton(document, handler);
    const host = document.getElementById(CONTROL_HOST_ID)!;
    const button = host.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("compact"));

    expect(button.type).toBe("button");
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute("aria-label")).toBe("Optimize Reading");
    expect(button.title).toBe("Optimize Reading");
    button.focus();
    fireEvent.click(button);
    expect(handler).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.dataset.state).toBe("loading");
    expect(button.getAttribute("aria-label")).toBe("Opening ReadBooster");

    resolve({ ok: true });
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.dataset.state).toBe("idle");
    expect(button.getAttribute("aria-label")).toBe("Optimize Reading");
    cleanup();
  });

  it("coalesces repeated layout requests without duplicating controls", async () => {
    FakeResizeObserver.instances = [];
    installMeasuredComposer({
      top: 680,
      right: 950,
      bottom: 760,
      left: 150,
      width: 800,
      height: 80,
    });
    const cleanup = injectOptimizeButton(document, async () => ({ ok: true }));
    for (let index = 0; index < 8; index += 1) {
      injectOptimizeButton(document, async () => ({ ok: true }));
      window.dispatchEvent(new Event("resize"));
    }
    await vi.waitFor(() =>
      expect(document.querySelectorAll(`#${CONTROL_HOST_ID}`)).toHaveLength(1),
    );
    cleanup();
  });

  it("keeps the cached full width stable when compact presentation changes visible width", async () => {
    FakeResizeObserver.instances = [];
    const geometry = installMeasuredComposer({
      top: 680,
      right: 740,
      bottom: 760,
      left: 140,
      width: 600,
      height: 80,
    });
    const cleanup = injectOptimizeButton(document, async () => ({ ok: true }));
    const host = document.getElementById(CONTROL_HOST_ID)!;
    const shadow = host.shadowRoot!;
    const button = shadow.querySelector<HTMLButtonElement>("button")!;
    const observer = FakeResizeObserver.instances[0];
    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("full"));

    const setAvailableSpace = (available: number): void => {
      geometry.setComposerRect({
        top: 680,
        right: 1000 - 18 - available,
        bottom: 760,
        left: 140,
        width: 600,
        height: 80,
      });
      observer.trigger();
    };
    const modeWrites = vi.spyOn(host, "setAttribute");

    setAvailableSpace(173);
    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("compact"));
    geometry.setSizerWidth(54);
    for (let index = 0; index < 8; index += 1) {
      setAvailableSpace(index % 2 === 0 ? 175 : 193);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(host.dataset.rbControlMode).toBe("compact");
    expect(shadow.querySelectorAll("button.rb-optimize-button")).toHaveLength(1);
    expect(shadow.querySelector(".rb-control-sizer-label")).not.toBeNull();
    expect(shadow.querySelector(".rb-control-sizer .rb-optimize-label")).toBeNull();
    expect(observer.observe).not.toHaveBeenCalledWith(host);
    expect(observer.observe).not.toHaveBeenCalledWith(shadow.querySelector(".rb-control-sizer"));

    setAvailableSpace(195);
    await vi.waitFor(() => expect(host.dataset.rbControlMode).toBe("full"));
    const responsiveModeWrites = modeWrites.mock.calls.filter(
      ([attribute]) => attribute === "data-rb-control-mode",
    );
    expect(responsiveModeWrites.map(([, value]) => value)).toEqual(["compact", "full"]);
    expect(shadow.querySelector("button")).toBe(button);
    cleanup();
  });
});
