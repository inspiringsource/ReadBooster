import type { ExtractedResponseSource } from "../shared/types";

export type ContentRequest =
  { type: "READBOOSTER_GET_STATUS" } | { type: "READBOOSTER_OPTIMIZE_LATEST" };

export interface ContentStatusResponse {
  ok: true;
  supported: boolean;
  source: ExtractedResponseSource | null;
  implemented: boolean;
  manuallyVerified: boolean;
  canExtractResponses: boolean;
  responseAvailable: boolean;
}

export type OptimizeResponse =
  | { ok: true; supported: true; source: ExtractedResponseSource }
  | {
      ok: false;
      supported: boolean;
      reason: "unsupported-page" | "no-response" | "reader-error";
    };

export type ContentResponse = ContentStatusResponse | OptimizeResponse;

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return type === "READBOOSTER_GET_STATUS" || type === "READBOOSTER_OPTIMIZE_LATEST";
}

export type ContentMessageHandler = (
  message: ContentRequest,
) => ContentResponse | Promise<ContentResponse>;

export function createContentMessageListener(
  handler: ContentMessageHandler,
  getSupportedState: () => boolean,
): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ContentResponse) => void,
) => boolean {
  return (message, _sender, sendResponse): boolean => {
    if (!isContentRequest(message)) {
      return false;
    }

    void Promise.resolve()
      .then(() => handler(message))
      .then(sendResponse)
      .catch(() => {
        const supported = (() => {
          try {
            return getSupportedState();
          } catch {
            return false;
          }
        })();
        sendResponse({
          ok: false,
          supported,
          reason: "reader-error",
        });
      });

    // Keep the Chrome message channel open for sendResponse in every supported Chrome MV3 version.
    return true;
  };
}
