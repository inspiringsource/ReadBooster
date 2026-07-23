import type { CodeAppearance } from "../shared/types";
import { writeClipboardText } from "./clipboard";

const LANGUAGE_LABELS: Record<string, string> = {
  bash: "Shell",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  python: "Python",
  sql: "SQL",
  typescript: "TypeScript",
};

interface CodeEnhancementOptions {
  appearance: CodeAppearance;
}

function explicitLanguage(code: HTMLElement): string {
  return code.getAttribute("lang")?.trim().toLowerCase() ?? "";
}

function readableLanguage(language: string): string {
  return (
    LANGUAGE_LABELS[language] ??
    (language ? `${language[0].toUpperCase()}${language.slice(1)}` : "Code")
  );
}

export function enhanceCodeBlocks(
  root: HTMLElement,
  { appearance }: CodeEnhancementOptions,
): () => void {
  const cleanups: Array<() => void> = [];
  let disposed = false;

  Array.from(root.querySelectorAll<HTMLElement>("pre")).forEach((pre, index) => {
    if (pre.closest(".rb-code-block") || pre.closest(".rb-table-block")) {
      return;
    }
    const firstChild = pre.firstElementChild;
    const code =
      firstChild instanceof HTMLElement && firstChild.tagName === "CODE"
        ? firstChild
        : (pre.querySelector<HTMLElement>("code") ?? pre);
    const source = code.textContent ?? "";
    const language = explicitLanguage(code);
    const label = readableLanguage(language);
    const wrapper = document.createElement("div");
    wrapper.className = "rb-code-block";
    wrapper.dataset.language = language || "plain";
    const toolbar = document.createElement("div");
    toolbar.className = "rb-code-toolbar rb-print-hidden";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", `${label} code block controls`);
    const title = document.createElement("span");
    title.className = "rb-code-language";
    title.textContent = label;
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy code";
    copyButton.setAttribute("aria-label", `Copy ${label.toLowerCase()} code block ${index + 1}`);
    toolbar.append(title, copyButton);
    pre.before(wrapper);
    wrapper.append(toolbar, pre);

    let feedbackTimer: number | undefined;
    const handleCopy = async (): Promise<void> => {
      window.clearTimeout(feedbackTimer);
      try {
        await writeClipboardText(source);
        copyButton.textContent = "Copied";
      } catch {
        copyButton.textContent = "Copy failed";
      }
      feedbackTimer = window.setTimeout(() => {
        copyButton.textContent = "Copy code";
      }, 1600);
    };
    copyButton.addEventListener("click", handleCopy);

    if (appearance === "color" && language) {
      void import("./syntaxHighlight").then(({ highlightedCode }) => {
        if (disposed || !code.isConnected) {
          return;
        }
        const highlighted = highlightedCode(source, language);
        if (highlighted !== null) {
          code.innerHTML = highlighted;
          code.classList.add("rb-code-highlighted");
        }
      });
    }

    cleanups.push(() => {
      window.clearTimeout(feedbackTimer);
      copyButton.removeEventListener("click", handleCopy);
      code.textContent = source;
      code.classList.remove("rb-code-highlighted");
      wrapper.before(pre);
      wrapper.remove();
    });
  });

  return () => {
    disposed = true;
    cleanups.reverse().forEach((cleanup) => cleanup());
  };
}
