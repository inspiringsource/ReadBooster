import type { ExtractedResponse } from "../../shared/types";
import type { ConversationAdapter } from "./ConversationAdapter";

export class GeminiAdapter implements ConversationAdapter {
  readonly source = "gemini" as const;

  constructor(private readonly hostname: string = window.location.hostname) {}

  isSupportedPage(): boolean {
    return this.hostname === "gemini.google.com";
  }

  // Scaffold only: no extraction is claimed until live DOM behavior is manually verified.
  getLatestAssistantResponse(): ExtractedResponse | null {
    return null;
  }

  getAllAssistantResponses(): ExtractedResponse[] {
    return [];
  }

  observePageChanges(): () => void {
    return () => undefined;
  }
}
