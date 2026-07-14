import type { DocumentContentBlock } from "../shared/types";

export interface OutlineItem {
  id: string;
  targetBlockId: string;
  targetHeadingId: string;
  text: string;
  level: number;
  documentOrder: number;
  children: OutlineItem[];
}

function safeIdPart(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "block"
  );
}

/** Builds a semantic outline from normalized, sanitized content blocks. */
export function buildOutline(blocks: readonly DocumentContentBlock[]): OutlineItem[] {
  const roots: OutlineItem[] = [];
  const stack: OutlineItem[] = [];
  let documentOrder = 0;

  for (const block of blocks) {
    const template = document.createElement("template");
    template.innerHTML = block.html;

    for (const heading of template.content.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, h5, h6",
    )) {
      const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text || !heading.id) {
        continue;
      }

      const level = Number.parseInt(heading.tagName.slice(1), 10);
      const item: OutlineItem = {
        id: `rb-outline-${safeIdPart(block.id)}-${documentOrder}`,
        targetBlockId: block.id,
        targetHeadingId: heading.id,
        text,
        level,
        documentOrder,
        children: [],
      };
      documentOrder += 1;

      while (stack.length > 0 && stack.at(-1)!.level >= level) {
        stack.pop();
      }
      const parent = stack.at(-1);
      if (parent) {
        parent.children.push(item);
      } else {
        roots.push(item);
      }
      stack.push(item);
    }
  }

  return roots;
}

export function flattenOutline(items: readonly OutlineItem[]): OutlineItem[] {
  return items.flatMap((item) => [item, ...flattenOutline(item.children)]);
}
