import { DOCUMENT_CONTENT_BLOCK_SELECTOR } from "../shared/contentKinds";
import { serializeSemanticText } from "../shared/semanticText";
import { writeClipboardText } from "./clipboard";

const COPY_FEEDBACK_DURATION_MS = 1600;
const COPY_EXCLUDED_SELECTOR = [
  ".rb-print-hidden",
  ".rb-sticker-layer",
  ".rb-sticker",
  ".rb-sticker-anchor",
].join(",");

export function documentBlockCopyText(content: HTMLElement): string {
  const copyRoot = content.cloneNode(true) as HTMLElement;
  copyRoot.querySelectorAll(COPY_EXCLUDED_SELECTOR).forEach((element) => element.remove());
  return serializeSemanticText(copyRoot);
}

export function enhanceDocumentBlocks(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  const documentBlocks = Array.from(
    root.querySelectorAll<HTMLElement>(DOCUMENT_CONTENT_BLOCK_SELECTOR),
  ).filter((block) => !block.closest(".rb-document-block"));

  documentBlocks.forEach((sourceBlock, index) => {
    if (!(sourceBlock.textContent ?? "").trim() && !sourceBlock.querySelector("img, table, pre")) {
      return;
    }

    const documentSection = sourceBlock.ownerDocument.createElement("section");
    documentSection.className = "rb-document-block";
    documentSection.setAttribute("aria-label", `Document ${index + 1}`);

    const header = sourceBlock.ownerDocument.createElement("header");
    header.className = "rb-document-block__header";

    const label = sourceBlock.ownerDocument.createElement("span");
    label.className = "rb-document-block__label";
    label.textContent = "Document";

    const copyButton = sourceBlock.ownerDocument.createElement("button");
    copyButton.type = "button";
    copyButton.className = "rb-document-block__copy rb-print-hidden";
    copyButton.textContent = "Copy";
    copyButton.setAttribute("aria-label", "Copy document");
    copyButton.setAttribute("aria-live", "polite");

    const content = sourceBlock.ownerDocument.createElement("div");
    content.className = "rb-document-block__content";
    content.append(...Array.from(sourceBlock.childNodes));
    header.append(label, copyButton);
    documentSection.append(header, content);
    sourceBlock.replaceWith(documentSection);

    let feedbackTimer: number | undefined;
    const handleCopy = async (event: Event): Promise<void> => {
      event.stopPropagation();
      window.clearTimeout(feedbackTimer);
      try {
        await writeClipboardText(documentBlockCopyText(content));
        copyButton.textContent = "Copied";
      } catch {
        copyButton.textContent = "Copy failed";
      }
      feedbackTimer = window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, COPY_FEEDBACK_DURATION_MS);
    };
    copyButton.addEventListener("click", handleCopy);

    cleanups.push(() => {
      window.clearTimeout(feedbackTimer);
      copyButton.removeEventListener("click", handleCopy);
      sourceBlock.append(...Array.from(content.childNodes));
      documentSection.replaceWith(sourceBlock);
    });
  });

  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}
