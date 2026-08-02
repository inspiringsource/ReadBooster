import { getExtensionApi } from "../shared/extensionApi";
import { READBOOSTER_CONTROL_ICON_PATH } from "../shared/assets";
import {
  availableSideSpace,
  CONTROL_COMPACT_SIZE,
  CONTROL_EDGE_MARGIN,
  CONTROL_FULL_WIDTH_FALLBACK,
  findComposerBoundary,
  positionOptimizeControl,
  readLayoutRect,
  resolveOptimizeControlMode,
  type OptimizeControlMode,
} from "./optimizeControlLayout";

export const CONTROL_HOST_ID = "readbooster-control-root";
export const CONTROL_LAYOUT_EVENT = "readbooster:control-layout";

const CONTROL_STYLES = `
  :host { all: initial; }
  button {
    align-items: center;
    appearance: none;
    background: #2357d9;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    font: 600 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    gap: 8px;
    justify-content: center;
    min-height: 44px;
    padding: 9px 14px;
    position: relative;
    transition: background-color 120ms ease;
    white-space: nowrap;
  }
  button:hover { background: #1948bd; }
  button:disabled { cursor: wait; opacity: 0.78; }
  button:focus-visible { outline: 3px solid #f7b955; outline-offset: 3px; }
  .rb-optimize-icon {
    border-radius: 5px;
    display: block;
    flex: 0 0 auto;
    height: 24px;
    object-fit: contain;
    width: 24px;
  }
  :host([data-rb-control-mode="compact"]) .rb-optimize-button {
    border-radius: 50%;
    height: 44px;
    padding: 9px;
    width: 44px;
  }
  :host([data-rb-control-mode="compact"]) .rb-optimize-button > .rb-optimize-label {
    display: none;
  }
  button[data-state="loading"]::after {
    animation: rb-control-spin 700ms linear infinite;
    border: 2px solid rgba(255, 255, 255, 0.45);
    border-radius: 50%;
    border-top-color: #fff;
    content: "";
    height: 26px;
    position: absolute;
    width: 26px;
  }
  button[data-state="loading"] .rb-optimize-icon { opacity: 0.35; }
  .rb-control-status {
    background: rgba(20, 24, 32, 0.96);
    border-radius: 6px;
    bottom: calc(100% + 8px);
    color: #fff;
    font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 200px;
    padding: 6px 8px;
    position: absolute;
    right: 0;
    text-align: center;
    width: max-content;
  }
  .rb-control-status[hidden] { display: none; }
  .rb-control-sizer {
    align-items: center;
    border: 1px solid transparent;
    display: inline-flex;
    font: 600 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    gap: 8px;
    left: -10000px;
    min-height: 44px;
    padding: 9px 14px;
    position: fixed;
    top: 0;
    visibility: hidden;
    white-space: nowrap;
  }
  @keyframes rb-control-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    button[data-state="loading"]::after { animation-duration: 1400ms; }
  }
`;

interface OptimizeResult {
  ok: boolean;
  reason?: "unsupported-page" | "no-response" | "reader-error";
}

function controlIconUrl(): string {
  try {
    return (
      getExtensionApi()?.runtime.getURL(READBOOSTER_CONTROL_ICON_PATH) ??
      `/${READBOOSTER_CONTROL_ICON_PATH}`
    );
  } catch {
    return `/${READBOOSTER_CONTROL_ICON_PATH}`;
  }
}

export function requestOptimizeButtonLayout(doc: Document): void {
  const host = doc.getElementById(CONTROL_HOST_ID);
  if (host) {
    host.dispatchEvent(new Event(CONTROL_LAYOUT_EVENT));
  }
}

export function injectOptimizeButton(
  doc: Document,
  onOptimize: () => Promise<OptimizeResult>,
  options: { getAnchor?: () => HTMLElement | null } = {},
): () => void {
  if (doc.getElementById(CONTROL_HOST_ID)) {
    requestOptimizeButtonLayout(doc);
    return () => undefined;
  }

  const host = doc.createElement("div");
  host.id = CONTROL_HOST_ID;
  host.style.position = "fixed";
  host.style.right = "18px";
  host.style.bottom = "18px";
  host.style.zIndex = "2147483646";
  host.setAttribute("data-rb-control-mode", "full");
  host.setAttribute("data-rb-control-placement", "viewport");

  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = CONTROL_STYLES;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "rb-optimize-button";
  button.setAttribute("aria-label", "Optimize Reading");
  button.title = "Optimize Reading";
  button.dataset.state = "idle";
  const icon = doc.createElement("img");
  icon.className = "rb-optimize-icon";
  icon.src = controlIconUrl();
  icon.alt = "";
  icon.width = 24;
  icon.height = 24;
  icon.setAttribute("aria-hidden", "true");
  const label = doc.createElement("span");
  label.className = "rb-optimize-label";
  label.textContent = "Optimize Reading";
  button.append(icon, label);

  const sizer = doc.createElement("span");
  sizer.className = "rb-control-sizer";
  sizer.setAttribute("aria-hidden", "true");
  const sizerIcon = icon.cloneNode(true) as HTMLImageElement;
  const sizerLabel = label.cloneNode(true) as HTMLSpanElement;
  sizerLabel.className = "rb-control-sizer-label";
  sizer.append(sizerIcon, sizerLabel);

  const status = doc.createElement("span");
  status.className = "rb-control-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;

  const view = doc.defaultView;
  let mode: OptimizeControlMode = "full";
  let observedComposer: HTMLElement | null = null;
  let observedAnchor: HTMLElement | null = null;
  let animationFrame: number | null = null;
  let timeoutId: number | null = null;
  let fullButtonWidth: number | null = null;
  let disposed = false;

  const updateHostStyle = (
    property: "bottom" | "right" | "top" | "position",
    value: string,
  ): void => {
    if (host.style[property] !== value) {
      host.style[property] = value;
    }
  };

  const updateLayout = (): void => {
    animationFrame = null;
    timeoutId = null;
    if (disposed || !view) {
      return;
    }

    const anchor = options.getAnchor?.() ?? null;
    if (anchor !== observedAnchor) {
      if (observedAnchor) resizeObserver?.unobserve(observedAnchor);
      observedAnchor = anchor;
      if (observedAnchor) resizeObserver?.observe(observedAnchor);
    }
    const composer = anchor ? null : findComposerBoundary(doc);
    if (composer !== observedComposer) {
      if (observedComposer) {
        resizeObserver?.unobserve(observedComposer);
      }
      observedComposer = composer;
      if (observedComposer) {
        resizeObserver?.observe(observedComposer);
      }
    }

    const viewportWidth = view.innerWidth || doc.documentElement.clientWidth;
    const viewportHeight = view.innerHeight || doc.documentElement.clientHeight;
    const anchorRect = readLayoutRect(anchor);
    const composerRect = readLayoutRect(composer);
    fullButtonWidth ??= Math.max(CONTROL_FULL_WIDTH_FALLBACK, readLayoutRect(sizer)?.width ?? 0);
    const availableWidth = anchorRect
      ? Math.max(0, Math.min(anchorRect.width, viewportWidth - CONTROL_EDGE_MARGIN * 2))
      : availableSideSpace(viewportWidth, composerRect);
    const nextMode = resolveOptimizeControlMode(availableWidth, fullButtonWidth, mode);
    if (nextMode !== mode) {
      mode = nextMode;
      host.setAttribute("data-rb-control-mode", mode);
    }

    const controlWidth = mode === "compact" ? CONTROL_COMPACT_SIZE : fullButtonWidth;
    const controlHeight = CONTROL_COMPACT_SIZE;
    if (anchorRect) {
      const left = Math.min(
        Math.max(CONTROL_EDGE_MARGIN, anchorRect.right - controlWidth),
        viewportWidth - controlWidth - CONTROL_EDGE_MARGIN,
      );
      updateHostStyle("position", "absolute");
      updateHostStyle(
        "right",
        `${Math.max(CONTROL_EDGE_MARGIN, viewportWidth - left - controlWidth)}px`,
      );
      updateHostStyle("top", `${Math.max(0, view.scrollY + anchorRect.bottom + 8)}px`);
      updateHostStyle("bottom", "auto");
      host.setAttribute("data-rb-control-placement", "anchor");
      return;
    }
    updateHostStyle("position", "fixed");
    const position = positionOptimizeControl({
      viewportWidth,
      viewportHeight,
      controlWidth,
      controlHeight,
      composer: composerRect,
    });
    updateHostStyle("right", `${position.right}px`);
    updateHostStyle("top", position.top === null ? "auto" : `${position.top}px`);
    updateHostStyle("bottom", position.top === null ? `${CONTROL_EDGE_MARGIN}px` : "auto");
    if (host.getAttribute("data-rb-control-placement") !== position.placement) {
      host.setAttribute("data-rb-control-placement", position.placement);
    }
  };

  const scheduleLayout = (): void => {
    if (disposed || animationFrame !== null || timeoutId !== null) {
      return;
    }
    if (view?.requestAnimationFrame) {
      animationFrame = view.requestAnimationFrame(updateLayout);
    } else {
      timeoutId = view?.setTimeout(updateLayout, 0) ?? null;
    }
  };

  const ResizeObserverClass = view?.ResizeObserver;
  const resizeObserver = ResizeObserverClass ? new ResizeObserverClass(scheduleLayout) : null;
  resizeObserver?.observe(doc.documentElement);
  view?.addEventListener("resize", scheduleLayout);
  view?.visualViewport?.addEventListener("resize", scheduleLayout);
  host.addEventListener(CONTROL_LAYOUT_EVENT, scheduleLayout);

  let busy = false;
  const handleClick = async (): Promise<void> => {
    if (busy || disposed) {
      return;
    }
    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-label", "Opening ReadBooster");
    button.title = "Opening ReadBooster";
    button.dataset.state = "loading";
    label.textContent = "Opening…";
    status.textContent = "";
    status.hidden = true;
    scheduleLayout();

    try {
      const result = await onOptimize();
      if (!result.ok && !disposed) {
        status.textContent =
          result.reason === "no-response"
            ? "No assistant response found."
            : "Could not open the reader.";
        status.hidden = false;
      }
    } catch {
      if (!disposed) {
        status.textContent = "Could not open the reader.";
        status.hidden = false;
      }
    } finally {
      busy = false;
      if (!disposed) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.setAttribute("aria-label", "Optimize Reading");
        button.title = "Optimize Reading";
        button.dataset.state = "idle";
        label.textContent = "Optimize Reading";
        scheduleLayout();
      }
    }
  };

  button.addEventListener("click", handleClick);
  shadow.append(style, button, sizer, status);
  doc.body.append(host);
  scheduleLayout();

  return () => {
    disposed = true;
    if (animationFrame !== null) {
      view?.cancelAnimationFrame(animationFrame);
    }
    if (timeoutId !== null) {
      view?.clearTimeout(timeoutId);
    }
    resizeObserver?.disconnect();
    view?.removeEventListener("resize", scheduleLayout);
    view?.visualViewport?.removeEventListener("resize", scheduleLayout);
    host.removeEventListener(CONTROL_LAYOUT_EVENT, scheduleLayout);
    button.removeEventListener("click", handleClick);
    host.remove();
  };
}
