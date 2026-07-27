// Claude's authenticated virtualized scroller remains unverified in this development environment.
// Reuse the shared finder so scanning occurs only when mounted messages have concrete overflow
// evidence inside one common source container; otherwise Refresh returns a single snapshot.
export {
  createConversationScanSource as createClaudeConversationScanSource,
  findConversationScroller as findClaudeConversationScroller,
} from "../conversationDomScanner";
