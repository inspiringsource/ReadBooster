import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { enhanceCodeBlocks } from "../src/reader/codeControls";

function codeFixture(language = "python"): HTMLElement {
  const root = document.createElement("article");
  root.innerHTML = `<pre><code lang="${language}">import matplotlib.pyplot as plt\n\nplt.plot([1, 2], [3, 4])\n</code></pre>`;
  document.body.append(root);
  return root;
}

describe("code block enhancements", () => {
  it("adds one accessible toolbar, highlights Python, and copies exact source", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText }, userAgent: "jsdom" });
    const root = codeFixture();
    const source = root.querySelector("code")!.textContent!;
    const cleanup = enhanceCodeBlocks(root, { appearance: "color" });

    expect(root.querySelectorAll(".rb-code-toolbar")).toHaveLength(1);
    expect(root.querySelector(".rb-code-language")?.textContent).toBe("Python");
    await vi.waitFor(() => expect(root.querySelector(".hljs-keyword")).not.toBeNull());
    fireEvent.click(root.querySelector("button")!);
    await vi.waitFor(() => expect(root.querySelector("button")?.textContent).toBe("Copied"));
    expect(writeText).toHaveBeenCalledWith(source);

    cleanup();
    expect(root.querySelector(".rb-code-toolbar")).toBeNull();
    expect(root.querySelector("code")?.textContent).toBe(source);
  });

  it("uses plain rendering for Plain mode and unsupported explicit languages", async () => {
    const plain = codeFixture("python");
    const unsupported = codeFixture("rust");
    const cleanupPlain = enhanceCodeBlocks(plain, { appearance: "plain" });
    const cleanupUnsupported = enhanceCodeBlocks(unsupported, { appearance: "color" });
    await Promise.resolve();

    expect(plain.querySelector(".rb-code-highlighted")).toBeNull();
    expect(unsupported.querySelector(".rb-code-highlighted")).toBeNull();
    expect(unsupported.querySelector(".rb-code-language")?.textContent).toBe("Rust");
    cleanupPlain();
    cleanupUnsupported();
  });

  it("does not duplicate controls and reports copy failure", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      userAgent: "jsdom",
    });
    const root = codeFixture();
    const firstCleanup = enhanceCodeBlocks(root, { appearance: "plain" });
    const secondCleanup = enhanceCodeBlocks(root, { appearance: "plain" });
    expect(root.querySelectorAll(".rb-code-toolbar")).toHaveLength(1);

    fireEvent.click(root.querySelector("button")!);
    await vi.waitFor(() => expect(root.querySelector("button")?.textContent).toBe("Copy failed"));
    secondCleanup();
    firstCleanup();
    expect(root.querySelectorAll(".rb-code-block")).toHaveLength(0);
  });
});
