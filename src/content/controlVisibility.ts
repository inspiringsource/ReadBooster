import type { ConversationAdapter } from "./adapters/ConversationAdapter";

export function shouldShowOptimizeControl(
  adapter: ConversationAdapter | null,
  disposed = false,
): boolean {
  if (disposed || !adapter?.isSupportedPage() || !adapter.capabilities.canExtractResponses) {
    return false;
  }
  return adapter.shouldInjectControl?.() ?? true;
}
