import type {
  AdapterCapabilities,
  ExtractedResponse,
  ExtractedResponseSource,
} from "../../shared/types";

export interface ConversationAdapter {
  readonly source: ExtractedResponseSource;
  readonly capabilities: AdapterCapabilities;
  isSupportedPage(): boolean;
  hasLatestAssistantResponse(): boolean;
  getLatestAssistantResponse(): ExtractedResponse | null;
  getAllAssistantResponses(): ExtractedResponse[];
  observePageChanges(callback: () => void): () => void;
}
