import { mountReader } from "../reader/mountReader";
import { getActiveAdapter } from "./adapters/getActiveAdapter";
import { CONTROL_HOST_ID, injectOptimizeButton } from "./injectButton";
import { type ContentRequest, type ContentResponse, isContentRequest } from "./messages";

declare global {
  interface Window {
    __readBoosterCleanup?: () => void;
  }
}

window.__readBoosterCleanup?.();

const adapter = getActiveAdapter();
let buttonCleanup: (() => void) | null = null;

async function optimizeLatest(): Promise<ContentResponse> {
  if (!adapter?.isSupportedPage()) {
    return { ok: false, supported: false, reason: "unsupported-page" };
  }

  const response = adapter.getLatestAssistantResponse();
  if (!response) {
    return { ok: false, supported: true, reason: "no-response" };
  }

  try {
    await mountReader(response);
    return { ok: true, supported: true, source: response.source };
  } catch {
    return { ok: false, supported: true, reason: "reader-error" };
  }
}

function ensureButton(): void {
  if (!adapter?.isSupportedPage() || document.getElementById(CONTROL_HOST_ID)) {
    return;
  }
  buttonCleanup = injectOptimizeButton(document, () => {
    void optimizeLatest();
  });
}

async function handleMessage(message: ContentRequest): Promise<ContentResponse> {
  if (message.type === "READBOOSTER_GET_STATUS") {
    const supported = Boolean(adapter?.isSupportedPage());
    return {
      ok: true,
      supported,
      source: adapter?.source ?? null,
      extractionAvailable: Boolean(adapter?.getLatestAssistantResponse()),
    };
  }
  return optimizeLatest();
}

const messageListener = (
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: ContentResponse) => void,
): boolean => {
  if (!isContentRequest(message)) {
    return false;
  }
  void handleMessage(message).then(sendResponse);
  return true;
};

chrome.runtime.onMessage.addListener(messageListener);
ensureButton();
const stopObserving = adapter?.observePageChanges(ensureButton) ?? (() => undefined);

window.__readBoosterCleanup = () => {
  stopObserving();
  buttonCleanup?.();
  chrome.runtime.onMessage.removeListener(messageListener);
  delete window.__readBoosterCleanup;
};
