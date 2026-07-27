import type {
  ConversationDocument,
  DocumentContentBlock,
  RefreshConversation,
} from "../shared/types";
import { getActiveAdapter } from "./adapters/getActiveAdapter";
import { CONTROL_HOST_ID, injectOptimizeButton, requestOptimizeButtonLayout } from "./injectButton";
import { createContentMessageListener } from "./messages";
import { createOptimizationService } from "./optimization";
import { getExtensionApi } from "../shared/extensionApi";
import { shouldShowOptimizeControl } from "./controlVisibility";

declare global {
  interface Window {
    __readBoosterCleanup?: () => void;
  }
}

window.__readBoosterCleanup?.();

const extensionApi = getExtensionApi();
if (!extensionApi) {
  throw new Error("ReadBooster extension API is unavailable");
}

const adapter = getActiveAdapter();
let buttonCleanup: (() => void) | null = null;
let disposed = false;
let readerModulePromise: Promise<typeof import("../reader/mountReader")> | null = null;

function loadReaderModule(): Promise<typeof import("../reader/mountReader")> {
  readerModulePromise ??= import("../reader/mountReader");
  return readerModulePromise;
}

async function mountConversationDocument(
  document: ConversationDocument,
  initialResponse: DocumentContentBlock,
  refreshConversation: RefreshConversation,
): Promise<void> {
  const readerModule = await loadReaderModule();
  if (disposed) {
    readerModule.unmountReader();
    throw new Error("ReadBooster content script was disposed");
  }
  await readerModule.mountReader(document, initialResponse, refreshConversation);
}

const optimizationService = createOptimizationService(adapter, mountConversationDocument);

function syncButton(): void {
  const shouldShow = shouldShowOptimizeControl(adapter, disposed);

  if (!shouldShow) {
    buttonCleanup?.();
    buttonCleanup = null;
    return;
  }
  if (document.getElementById(CONTROL_HOST_ID)) {
    requestOptimizeButtonLayout(document);
    return;
  }
  buttonCleanup = injectOptimizeButton(document, optimizationService.optimizeLatest);
}

const messageListener = createContentMessageListener(optimizationService.handleMessage, () =>
  Boolean(adapter?.isSupportedPage()),
);

extensionApi.runtime.onMessage.addListener(messageListener);
syncButton();
const stopObserving = adapter?.capabilities.canExtractResponses
  ? adapter.observePageChanges(syncButton)
  : () => undefined;

window.__readBoosterCleanup = () => {
  disposed = true;
  stopObserving();
  buttonCleanup?.();
  buttonCleanup = null;
  extensionApi.runtime.onMessage.removeListener(messageListener);
  if (readerModulePromise) {
    void readerModulePromise
      .then((readerModule) => readerModule.unmountReader())
      .catch(() => undefined);
  }
  delete window.__readBoosterCleanup;
};
