import type {
  AdapterCapabilities,
  ConversationDocument,
  ExtractedResponse,
  ExtractedResponseSource,
} from "../../shared/types";

export interface ConversationAdapter {
  readonly source: ExtractedResponseSource;
  readonly capabilities: AdapterCapabilities;
  isSupportedPage(): boolean;
  getConversationDocument(): ConversationDocument | null;
  hasLatestAssistantResponse(): boolean;
  getLatestAssistantResponse(): ExtractedResponse | null;
  getAllAssistantResponses(): ExtractedResponse[];
  observePageChanges(callback: () => void): () => void;
}
