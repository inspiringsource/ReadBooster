import { useEffect, useState } from "react";

import type { ContentRequest, ContentResponse } from "../content/messages";

type PopupState = "loading" | "supported" | "unsupported" | "unavailable";

function isConfiguredUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "chatgpt.com" ||
      hostname.endsWith(".chatgpt.com") ||
      hostname === "claude.ai" ||
      hostname.endsWith(".claude.ai") ||
      hostname === "gemini.google.com"
    );
  } catch {
    return false;
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function sendToTab(tabId: number, request: ContentRequest): Promise<ContentResponse> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, request, (response: ContentResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error("No response from the content script"));
      } else {
        resolve(response);
      }
    });
  });
}

export function Popup() {
  const [state, setState] = useState<PopupState>("loading");
  const [tabId, setTabId] = useState<number | null>(null);
  const [message, setMessage] = useState("Checking this page…");
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    void (async () => {
      const tab = await getActiveTab();
      if (tab?.id == null || !isConfiguredUrl(tab.url)) {
        setState("unsupported");
        setMessage("This page is not supported.");
        return;
      }

      setTabId(tab.id);
      try {
        const response = await sendToTab(tab.id, { type: "READBOOSTER_GET_STATUS" });
        if (response.ok && "canExtractResponses" in response && response.supported) {
          if (!response.canExtractResponses) {
            const platform =
              response.source === "claude"
                ? "Claude"
                : response.source === "gemini"
                  ? "Gemini"
                  : "This platform";
            setState("unavailable");
            setMessage(`${platform} support is not yet implemented.`);
          } else {
            setState("supported");
            setMessage(
              response.responseAvailable
                ? "A response is ready to optimize."
                : "Supported page. No assistant response found yet.",
            );
          }
        } else {
          setState("unsupported");
          setMessage("This page is not supported.");
        }
      } catch {
        setState("unavailable");
        setMessage("Refresh this supported page to activate ReadBooster.");
      }
    })();
  }, []);

  const optimize = async (): Promise<void> => {
    if (tabId === null) {
      return;
    }
    setOptimizing(true);
    try {
      const response = await sendToTab(tabId, { type: "READBOOSTER_OPTIMIZE_LATEST" });
      if (response.ok) {
        window.close();
      } else if (response.reason === "no-response") {
        setMessage("No assistant response was found on this page.");
      } else {
        setMessage("ReadBooster could not open the reader on this page.");
      }
    } catch {
      setMessage("Refresh this supported page and try again.");
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <main className="popup-shell">
      <header>
        <span className="wordmark">ReadBooster</span>
        <span className={`status-dot status-${state}`} aria-hidden="true" />
      </header>
      <p className="status" role="status">
        {message}
      </p>
      <button
        type="button"
        onClick={() => void optimize()}
        disabled={state !== "supported" || optimizing}
      >
        {optimizing ? "Opening…" : "Optimize latest response"}
      </button>
      <p className="privacy">ReadBooster processes content locally in your browser.</p>
    </main>
  );
}
