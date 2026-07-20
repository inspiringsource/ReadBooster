import { describe, expect, it, vi } from "vitest";

import { MistralAdapter } from "../src/content/adapters/MistralAdapter";
import { shouldShowOptimizeControl } from "../src/content/controlVisibility";
import { CONTROL_HOST_ID, injectOptimizeButton } from "../src/content/injectButton";

function mistralDocument(content: string): Document {
  return new DOMParser().parseFromString(`<main>${content}</main>`, "text/html");
}

function syncTestControl(adapter: MistralAdapter): void {
  if (shouldShowOptimizeControl(adapter) && !document.getElementById(CONTROL_HOST_ID)) {
    injectOptimizeButton(document, async () => ({ ok: true }));
  }
}

describe("Mistral Optimize Reading eligibility", () => {
  it("injects exactly one control for a production /work answer part", () => {
    const adapter = new MistralAdapter(
      mistralDocument(`
        <section data-response-id="production-response">
          <div data-message-part-type="answer" data-testid="text-message-part">
            <p>Production response.</p>
          </div>
        </section>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/production-conversation",
    );

    expect(shouldShowOptimizeControl(adapter)).toBe(true);
    syncTestControl(adapter);
    syncTestControl(adapter);

    const hosts = document.querySelectorAll(`#${CONTROL_HOST_ID}`);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].shadowRoot?.querySelector("button")?.textContent).toBe("Optimize Reading");
  });

  it("does not inject on unsupported, empty, or Canvas-only pages", () => {
    const canvas = new MistralAdapter(
      mistralDocument(`
        <div class="tiptap ProseMirror markdown-editor markdown-container-style">
          <div data-testid="text-message-part"><p>Editable Canvas content.</p></div>
        </div>`),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/canvas",
    );
    const account = new MistralAdapter(
      mistralDocument("<p>Account page.</p>"),
      "chat.mistral.ai",
      "https://chat.mistral.ai/account",
    );
    const empty = new MistralAdapter(
      mistralDocument("<p>Start a new conversation.</p>"),
      "chat.mistral.ai",
      "https://chat.mistral.ai/work/empty",
    );
    const injection = vi.spyOn(document.body, "append");

    expect(shouldShowOptimizeControl(canvas)).toBe(false);
    expect(shouldShowOptimizeControl(account)).toBe(false);
    expect(shouldShowOptimizeControl(empty)).toBe(false);
    syncTestControl(canvas);
    syncTestControl(account);
    syncTestControl(empty);

    expect(document.getElementById(CONTROL_HOST_ID)).toBeNull();
    expect(injection).not.toHaveBeenCalled();
  });
});
