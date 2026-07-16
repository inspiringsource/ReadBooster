// ChatGPT keeps this adapter-named facade so maintenance comments and imports remain platform
// specific while the bounded DOM mechanics can be shared with future adapters.
export {
  createConversationScanSource as createChatGPTConversationScanSource,
  findConversationScroller as findChatGPTConversationScroller,
  waitForConversationDomToSettle as waitForChatGPTDomToSettle,
} from "../conversationDomScanner";

export type { DomSettleOptions } from "../conversationDomScanner";
