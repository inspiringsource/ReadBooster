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
  button:focus-visible { outline: 3px solid #f7b955; outline-offset: 3px; }
`;

export function injectOptimizeButton(doc: Document, onOptimize: () => void): () => void {
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
  button.addEventListener("click", onOptimize);
  shadow.append(style, button);
  doc.body.append(host);

  return () => {
    button.removeEventListener("click", onOptimize);
    host.remove();
  };
}
