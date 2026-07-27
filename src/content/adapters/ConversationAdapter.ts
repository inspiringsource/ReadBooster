import type {
  AdapterCapabilities,
  ConversationDocument,
  ConversationScanOptions,
  ConversationScanResult,
  ExtractedResponse,
  ExtractedResponseSource,
} from "../../shared/types";

export interface ConversationAdapter {
  readonly source: ExtractedResponseSource;
  readonly displayName: string;
  readonly capabilities: AdapterCapabilities;
  isSupportedPage(): boolean;
  shouldInjectControl?(): boolean;
  getConversationDocument(): ConversationDocument | null;
  scanConversationDocument?(options?: ConversationScanOptions): Promise<ConversationScanResult>;
  hasLatestAssistantResponse(): boolean;
  getLatestAssistantResponse(): ExtractedResponse | null;
  getAllAssistantResponses(): ExtractedResponse[];
  observePageChanges(callback: () => void): () => void;
}
