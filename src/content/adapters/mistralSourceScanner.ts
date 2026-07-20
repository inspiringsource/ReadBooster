// Mistral's authenticated conversation scroller remains unconfirmed for the 0.6.1 fix.
// The shared finder therefore scrolls only when mounted messages have a common ancestor with
// concrete vertical overflow; otherwise Refresh returns the honest single-snapshot fallback.
export {
  createConversationScanSource as createMistralConversationScanSource,
  findConversationScroller as findMistralConversationScroller,
} from "../conversationDomScanner";
