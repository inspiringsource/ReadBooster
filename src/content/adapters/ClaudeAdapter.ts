import type { ConversationDocument, ExtractedResponse } from "../../shared/types";
import type { ConversationAdapter } from "./ConversationAdapter";

export class ClaudeAdapter implements ConversationAdapter {
  readonly source = "claude" as const;
  readonly capabilities = {
    configured: false,
    implemented: false,
    manuallyVerified: false,
    canExtractResponses: false,
  } as const;

  isSupportedPage(): boolean {
    return false;
  }

  // Scaffold only: no extraction is claimed until live DOM behavior is manually verified.
  hasLatestAssistantResponse(): boolean {
    return false;
  }

  getConversationDocument(): ConversationDocument | null {
    return null;
  }

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
