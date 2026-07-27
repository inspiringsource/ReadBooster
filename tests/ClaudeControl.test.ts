import { describe, expect, it, vi } from "vitest";

import { ClaudeAdapter } from "../src/content/adapters/ClaudeAdapter";
import { shouldShowOptimizeControl } from "../src/content/controlVisibility";
import { CONTROL_HOST_ID, injectOptimizeButton } from "../src/content/injectButton";

function claudeDocument(content: string): Document {
  return new DOMParser().parseFromString(
    `<main data-testid="conversation">${content}</main>`,
    "text/html",
  );
}

function syncTestControl(adapter: ClaudeAdapter): void {
  if (shouldShowOptimizeControl(adapter) && !document.getElementById(CONTROL_HOST_ID)) {
    injectOptimizeButton(document, async () => ({ ok: true }));
  }
}

describe("Claude Optimize Reading eligibility", () => {
  it("injects exactly one control when usable Claude assistant content exists", () => {
    const adapter = new ClaudeAdapter(
      claudeDocument(`
        <article data-message-author-role="assistant" data-message-id="answer-1">
          <div data-testid="assistant-message-content"><p>Usable answer.</p></div>
        </article>`),
      "claude.ai",
      "https://claude.ai/chat/conversation-1",
    );

    expect(shouldShowOptimizeControl(adapter)).toBe(true);
    syncTestControl(adapter);
    syncTestControl(adapter);
    expect(document.querySelectorAll(`#${CONTROL_HOST_ID}`)).toHaveLength(1);
    expect(document.getElementById(CONTROL_HOST_ID)?.shadowRoot?.textContent).toContain(
      "Optimize Reading",
    );
  });

  it("does not inject on account, empty, or unassociated artifact-panel pages", () => {
    const account = new ClaudeAdapter(
      claudeDocument("<p>Account settings.</p>"),
      "claude.ai",
      "https://claude.ai/settings/profile",
    );
    const empty = new ClaudeAdapter(
      claudeDocument('<article data-testid="assistant-response"><button>Copy</button></article>'),
      "claude.ai",
      "https://claude.ai/new",
    );
    const sidePanel = new ClaudeAdapter(
      claudeDocument(`
        <aside data-testid="artifact-panel">
          <div data-artifact-id="unassociated"><div data-testid="artifact-content">Panel</div></div>
        </aside>`),
      "claude.ai",
      "https://claude.ai/chat/conversation-2",
    );
    const append = vi.spyOn(document.body, "append");

    for (const adapter of [account, empty, sidePanel]) {
      expect(shouldShowOptimizeControl(adapter)).toBe(false);
      syncTestControl(adapter);
    }
    expect(document.getElementById(CONTROL_HOST_ID)).toBeNull();
    expect(append).not.toHaveBeenCalled();
  });
});
