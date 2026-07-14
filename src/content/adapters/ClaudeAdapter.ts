import type { ExtractedResponse } from "../../shared/types";
import type { ConversationAdapter } from "./ConversationAdapter";

export class ClaudeAdapter implements ConversationAdapter {
  readonly source = "claude" as const;

  constructor(private readonly hostname: string = window.location.hostname) {}

  isSupportedPage(): boolean {
    return this.hostname === "claude.ai" || this.hostname.endsWith(".claude.ai");
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
