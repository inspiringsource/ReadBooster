import { useEffect, useState } from "react";

import type { ContentRequest, ContentResponse } from "../content/messages";
import { getExtensionApi } from "../shared/extensionApi";
import { isSupportedPlatformUrl } from "../shared/platforms";

type PopupState = "loading" | "supported" | "unsupported" | "unavailable";

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const extensionApi = getExtensionApi();
  if (!extensionApi) {
    return null;
  }
  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function sendToTab(tabId: number, request: ContentRequest): Promise<ContentResponse> {
  const extensionApi = getExtensionApi();
  if (!extensionApi) {
    throw new Error("ReadBooster extension API is unavailable");
  }
  const response = (await extensionApi.tabs.sendMessage(tabId, request)) as
    ContentResponse | undefined;
  if (!response) {
    throw new Error("No response from the content script");
  }
  return response;
}

export function Popup() {
  const [state, setState] = useState<PopupState>("loading");
  const [tabId, setTabId] = useState<number | null>(null);
  const [message, setMessage] = useState("Checking this page…");
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    void (async () => {
      const tab = await getActiveTab();
      if (tab?.id == null || !isSupportedPlatformUrl(tab.url)) {
        setState("unsupported");
        setMessage("This page is not supported.");
        return;
      }

      setTabId(tab.id);
      try {
        const response = await sendToTab(tab.id, { type: "READBOOSTER_GET_STATUS" });
        if (response.ok && "canExtractResponses" in response && response.supported) {
          if (!response.canExtractResponses) {
            setState("unavailable");
            setMessage("This platform is not available in this release.");
          } else {
            setState("supported");
            setMessage(
              response.responseAvailable
                ? "Readable content is ready to optimize."
                : "Supported page. No readable content found yet.",
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
        setMessage("No readable content was found on this page.");
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
        <span className="popup-brand">
          <img src="/icons/readbooster-32.png" alt="" width="32" height="32" />
          <span className="wordmark">ReadBooster</span>
        </span>
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
        {optimizing ? "Opening…" : "Optimize Reading"}
      </button>
      <p className="privacy">ReadBooster processes content locally in your browser.</p>
    </main>
  );
}
