import type { ExtractedResponse } from "../../shared/types";
import type { ConversationAdapter } from "./ConversationAdapter";

export class ClaudeAdapter implements ConversationAdapter {
  readonly source = "claude" as const;
  readonly capabilities = {
    configured: true,
    implemented: false,
    manuallyVerified: false,
    canExtractResponses: false,
  } as const;

  constructor(private readonly hostname: string = window.location.hostname) {}

  isSupportedPage(): boolean {
    return this.hostname === "claude.ai" || this.hostname.endsWith(".claude.ai");
  }

  // Scaffold only: no extraction is claimed until live DOM behavior is manually verified.
  hasLatestAssistantResponse(): boolean {
    return false;
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
