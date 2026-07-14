import type { ExtractedResponse } from "../shared/types";
import { getActiveAdapter } from "./adapters/getActiveAdapter";
import { CONTROL_HOST_ID, injectOptimizeButton } from "./injectButton";
import { createContentMessageListener } from "./messages";
import { createOptimizationService } from "./optimization";

declare global {
  interface Window {
    __readBoosterCleanup?: () => void;
  }
}

window.__readBoosterCleanup?.();

const adapter = getActiveAdapter();
let buttonCleanup: (() => void) | null = null;
let disposed = false;
let readerModulePromise: Promise<typeof import("../reader/mountReader")> | null = null;

function loadReaderModule(): Promise<typeof import("../reader/mountReader")> {
  readerModulePromise ??= import("../reader/mountReader");
  return readerModulePromise;
}

async function mountExtractedResponses(
  responses: ExtractedResponse[],
  initialResponseIndex: number,
): Promise<void> {
  const readerModule = await loadReaderModule();
  if (disposed) {
    readerModule.unmountReader();
    throw new Error("ReadBooster content script was disposed");
  }
  await readerModule.mountReader(responses, initialResponseIndex);
}

const optimizationService = createOptimizationService(adapter, mountExtractedResponses);

function ensureButton(): void {
  if (
    disposed ||
    !adapter?.isSupportedPage() ||
    !adapter.capabilities.canExtractResponses ||
    document.getElementById(CONTROL_HOST_ID)
  ) {
    return;
  }
  buttonCleanup = injectOptimizeButton(document, optimizationService.optimizeLatest);
}

const messageListener = createContentMessageListener(optimizationService.handleMessage, () =>
  Boolean(adapter?.isSupportedPage()),
);

chrome.runtime.onMessage.addListener(messageListener);
ensureButton();
const stopObserving = adapter?.capabilities.canExtractResponses
  ? adapter.observePageChanges(ensureButton)
  : () => undefined;

window.__readBoosterCleanup = () => {
  disposed = true;
  stopObserving();
  buttonCleanup?.();
  buttonCleanup = null;
  chrome.runtime.onMessage.removeListener(messageListener);
  if (readerModulePromise) {
    void readerModulePromise
      .then((readerModule) => readerModule.unmountReader())
      .catch(() => undefined);
  }
  delete window.__readBoosterCleanup;
};
