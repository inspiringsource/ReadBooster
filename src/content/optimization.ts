import type { ConversationDocument, DocumentContentBlock } from "../shared/types";
import { assistantBlocks } from "../shared/types";
import type { ConversationAdapter } from "./adapters/ConversationAdapter";
import type {
  ContentRequest,
  ContentResponse,
  ContentStatusResponse,
  OptimizeResponse,
} from "./messages";

export type ReaderMounter = (
  document: ConversationDocument,
  initialResponse: DocumentContentBlock,
) => Promise<unknown>;

export interface OptimizationService {
  getStatus(): ContentStatusResponse;
  optimizeLatest(): Promise<OptimizeResponse>;
  handleMessage(message: ContentRequest): Promise<ContentResponse>;
  isBusy(): boolean;
}

export function createOptimizationService(
  adapter: ConversationAdapter | null,
  mountResponse: ReaderMounter,
): OptimizationService {
  let inFlight: Promise<OptimizeResponse> | null = null;

  const getStatus = (): ContentStatusResponse => {
    const supported = Boolean(adapter?.isSupportedPage());
    const capabilities = adapter?.capabilities;
    let responseAvailable = false;
    if (adapter && supported && capabilities?.canExtractResponses) {
      try {
        responseAvailable = adapter.hasLatestAssistantResponse();
      } catch {
        responseAvailable = false;
      }
    }

    return {
      ok: true,
      supported,
      source: adapter?.source ?? null,
      implemented: capabilities?.implemented ?? false,
      manuallyVerified: capabilities?.manuallyVerified ?? false,
      canExtractResponses: capabilities?.canExtractResponses ?? false,
      responseAvailable,
    };
  };

  const runOptimization = async (): Promise<OptimizeResponse> => {
    if (!adapter?.isSupportedPage()) {
      return { ok: false, supported: false, reason: "unsupported-page" };
    }
    if (!adapter.capabilities.canExtractResponses) {
      return { ok: false, supported: true, reason: "unsupported-page" };
    }

    try {
      const document = adapter.getConversationDocument();
      if (!document) {
        return { ok: false, supported: true, reason: "no-response" };
      }
      const responses = assistantBlocks(document);
      if (responses.length === 0) {
        return { ok: false, supported: true, reason: "no-response" };
      }
      const initialResponse = responses.at(-1)!;
      await mountResponse(document, initialResponse);
      return { ok: true, supported: true, source: document.source };
    } catch {
      return { ok: false, supported: true, reason: "reader-error" };
    }
  };

  const optimizeLatest = (): Promise<OptimizeResponse> => {
    if (inFlight) {
      return inFlight;
    }

    const operation = runOptimization();
    inFlight = operation;
    const clearInFlight = (): void => {
      if (inFlight === operation) {
        inFlight = null;
      }
    };
    void operation.then(clearInFlight, clearInFlight);
    return operation;
  };

  return {
    getStatus,
    optimizeLatest,
    handleMessage(message) {
      if (message.type === "READBOOSTER_GET_STATUS") {
        return Promise.resolve(getStatus());
      }
      return optimizeLatest();
    },
    isBusy() {
      return inFlight !== null;
    },
  };
}
