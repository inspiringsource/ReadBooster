export const CONTROL_HOST_ID = "readbooster-control-root";

const CONTROL_STYLES = `
  :host { all: initial; }
  button {
    appearance: none;
    background: #2357d9;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
    color: #fff;
    cursor: pointer;
    font: 600 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 10px 14px;
    white-space: nowrap;
  }
  button:hover { background: #1948bd; }
  button:disabled { cursor: wait; opacity: 0.78; }
  button:focus-visible { outline: 3px solid #f7b955; outline-offset: 3px; }
`;

interface OptimizeResult {
  ok: boolean;
  reason?: "unsupported-page" | "no-response" | "reader-error";
}

export function injectOptimizeButton(
  doc: Document,
  onOptimize: () => Promise<OptimizeResult>,
): () => void {
  if (doc.getElementById(CONTROL_HOST_ID)) {
    return () => undefined;
  }

  const host = doc.createElement("div");
  host.id = CONTROL_HOST_ID;
  host.style.position = "fixed";
  host.style.right = "18px";
  host.style.bottom = "18px";
  host.style.zIndex = "2147483646";

  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = CONTROL_STYLES;
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = "Optimize Reading";
  button.setAttribute("aria-label", "Optimize the latest assistant response for reading");
  const status = doc.createElement("span");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.cssText =
    "display:block;margin-top:6px;padding:4px 7px;border-radius:5px;background:rgba(20,24,32,.94);color:#fff;font:12px/1.3 system-ui;max-width:180px;text-align:center;";

  let busy = false;
  let disposed = false;
  const handleClick = async (): Promise<void> => {
    if (busy || disposed) {
      return;
    }
    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Opening…";
    status.textContent = "";

    try {
      const result = await onOptimize();
      if (!result.ok && !disposed) {
        status.textContent =
          result.reason === "no-response"
            ? "No assistant response found."
            : "Could not open the reader.";
      }
    } catch {
      if (!disposed) {
        status.textContent = "Could not open the reader.";
      }
    } finally {
      busy = false;
      if (!disposed) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        button.textContent = "Optimize Reading";
      }
    }
  };

  button.addEventListener("click", handleClick);
  shadow.append(style, button, status);
  doc.body.append(host);

  return () => {
    disposed = true;
    button.removeEventListener("click", handleClick);
    host.remove();
  };
}
