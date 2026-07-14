import type { ExtractedResponseSource } from "../shared/types";

export type ContentRequest =
  { type: "READBOOSTER_GET_STATUS" } | { type: "READBOOSTER_OPTIMIZE_LATEST" };

export interface ContentStatusResponse {
  ok: true;
  supported: boolean;
  source: ExtractedResponseSource | null;
  extractionAvailable: boolean;
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
