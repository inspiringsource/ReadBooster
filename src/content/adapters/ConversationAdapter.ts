import type { ExtractedResponse, ExtractedResponseSource } from "../../shared/types";

export interface ConversationAdapter {
  readonly source: ExtractedResponseSource;
  isSupportedPage(): boolean;
  getLatestAssistantResponse(): ExtractedResponse | null;
  getAllAssistantResponses(): ExtractedResponse[];
  observePageChanges(callback: () => void): () => void;
}
