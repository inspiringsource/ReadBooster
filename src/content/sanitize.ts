import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "del",
  "hr",
  "sup",
  "sub",
  "details",
  "summary",
  "figure",
  "figcaption",
  "img",
  "div",
  "span",
];

const ALLOWED_ATTR = [
  "href",
  "title",
  "lang",
  "dir",
  "id",
  "colspan",
  "rowspan",
  "scope",
  "headers",
  "start",
  "reversed",
  "value",
  "src",
  "alt",
  "width",
  "height",
];

const FLOW_BLOCK_TAGS = new Set([
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DETAILS",
  "DIV",
  "FIGCAPTION",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "OL",
  "P",
  "PRE",
  "SUMMARY",
  "TABLE",
  "UL",
]);

export interface SanitizedContent {
  html: string;
  text: string;
}

function safeIdPart(value: string): string {
  const safe = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return safe || "block";
}

function namespaceSemanticIds(root: ParentNode, blockId: string): void {
  const idMap = new Map<string, string>();
  let nextId = 0;
  for (const elementWithId of root.querySelectorAll<HTMLElement>("[id]")) {
    const sourceId = elementWithId.id;
    const readerId = `rb-content-${safeIdPart(blockId)}-source-${nextId++}-${safeIdPart(sourceId)}`;
    if (!idMap.has(sourceId)) {
      idMap.set(sourceId, readerId);
    }
    elementWithId.id = readerId;
  }
  for (const cell of root.querySelectorAll<HTMLElement>("[headers]")) {
    const mappedHeaders = (cell.getAttribute("headers") ?? "")
      .split(/\s+/)
      .map((header) => idMap.get(header))
      .filter((header): header is string => Boolean(header));
    if (mappedHeaders.length > 0) {
      cell.setAttribute("headers", mappedHeaders.join(" "));
    } else {
      cell.removeAttribute("headers");
    }
  }

  let headingIndex = 0;
  for (const heading of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
    if (!heading.id) {
      heading.id = `rb-content-${safeIdPart(blockId)}-heading-${headingIndex}-${safeIdPart(
        heading.textContent?.trim() ?? "heading",
      )}`;
    }
    headingIndex += 1;
  }
}

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "bash",
  css: "css",
  html: "html",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  python: "python",
  py: "python",
  shell: "bash",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  typescript: "typescript",
  xml: "html",
};

function preserveExplicitCodeLanguages(root: ParentNode): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre code")) {
    const wrapper = code.closest("pre");
    const candidates = [
      code.getAttribute("lang"),
      code.getAttribute("data-language"),
      wrapper?.getAttribute("data-language"),
      ...Array.from(code.classList).filter((name) => /^(?:language|lang)-/i.test(name)),
      ...(wrapper
        ? Array.from(wrapper.classList).filter((name) => /^(?:language|lang)-/i.test(name))
        : []),
    ];
    for (const candidate of candidates) {
      const normalized = candidate
        ?.toLowerCase()
        .replace(/^(language|lang)-/, "")
        .trim();
      if (normalized && /^[a-z0-9+#.-]{1,32}$/.test(normalized)) {
        code.setAttribute("lang", LANGUAGE_ALIASES[normalized] ?? normalized);
        break;
      }
    }
  }
}

export function isSafeImageSource(value: string): boolean {
  const source = value.trim();
  if (/^blob:/i.test(source) || /^https:\/\//i.test(source)) {
    return true;
  }
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(source);
}

function isSafeLinkHref(value: string): boolean {
  const href = value.trim();
  return /^(?:https?:|mailto:|tel:)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function validateSanitizedImages(root: ParentNode): void {
  for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
    const source = image.getAttribute("src") ?? "";
    if (!isSafeImageSource(source)) {
      image.remove();
      continue;
    }
    if (!image.hasAttribute("alt")) {
      image.alt = "Generated chart";
    }
    for (const attribute of ["width", "height"] as const) {
      const value = image.getAttribute(attribute) ?? "";
      if (value && !/^\d{1,5}$/.test(value)) {
        image.removeAttribute(attribute);
      }
    }
  }
  for (const figure of root.querySelectorAll("figure")) {
    if (!figure.querySelector("img") && !(figure.textContent ?? "").trim()) {
      figure.remove();
    }
  }
}

function serializeInlineNodes(nodes: Iterable<Node>): string {
  let value = "";
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      value += node.textContent?.replace(/\s+/g, " ") ?? "";
      continue;
    }
    if (!(node instanceof Element)) {
      continue;
    }
    if (node.tagName === "BR") {
      value += "\n";
    } else if (node.tagName === "IMG") {
      value += node.getAttribute("alt") ?? "";
    } else if (node.tagName === "CODE") {
      value += (node.textContent ?? "").replace(/\r\n?/g, "\n");
    } else if (FLOW_BLOCK_TAGS.has(node.tagName)) {
      const block = serializeBlock(node);
      value += block ? `\n${block}\n` : "";
    } else {
      value += serializeInlineNodes(node.childNodes);
    }
  }

  return value
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .trim();
}

function serializeList(list: Element): string {
  const ordered = list.tagName === "OL";
  const configuredStart = Number.parseInt(list.getAttribute("start") ?? "1", 10);
  let nextNumber = Number.isFinite(configuredStart) ? configuredStart : 1;
  const lines: string[] = [];

  for (const item of Array.from(list.children).filter((child) => child.tagName === "LI")) {
    const explicitValue = Number.parseInt(item.getAttribute("value") ?? "", 10);
    if (ordered && Number.isFinite(explicitValue)) {
      nextNumber = explicitValue;
    }

    const nestedLists = Array.from(item.children).filter(
      (child) => child.tagName === "UL" || child.tagName === "OL",
    );
    const inlineNodes = Array.from(item.childNodes).filter(
      (node) => !(node instanceof Element && nestedLists.includes(node)),
    );
    const marker = ordered ? `${nextNumber}.` : "-";
    const itemText = serializeInlineNodes(inlineNodes);
    lines.push(`${marker} ${itemText}`.trimEnd());

    for (const nested of nestedLists) {
      const nestedText = serializeList(nested)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");
      if (nestedText) {
        lines.push(nestedText);
      }
    }
    nextNumber += 1;
  }

  return lines.join("\n");
}

function serializeTable(table: Element): string {
  const rows: string[] = [];
  for (const row of table.querySelectorAll("tr")) {
    const cells = Array.from(row.children).filter(
      (cell) => cell.tagName === "TH" || cell.tagName === "TD",
    );
    if (cells.length > 0) {
      rows.push(
        cells
          .map((cell) =>
            serializeFlow(cell)
              .replace(/\s*\n+\s*/g, " ")
              .trim(),
          )
          .join("\t"),
      );
    }
  }
  return rows.join("\n");
}

function serializeBlock(element: Element): string {
  switch (element.tagName) {
    case "PRE":
      return (element.textContent ?? "").replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
    case "UL":
    case "OL":
      return serializeList(element);
    case "TABLE":
      return serializeTable(element);
    case "FIGURE": {
      const alternative = Array.from(element.querySelectorAll("img"))
        .map((image) => image.getAttribute("alt") ?? "")
        .filter(Boolean)
        .join("\n");
      const caption = Array.from(element.querySelectorAll("figcaption"))
        .map((item) => serializeFlow(item).trim())
        .filter(Boolean)
        .join("\n");
      return [alternative, caption]
        .filter((part, index, values) => part && values.indexOf(part) === index)
        .join("\n");
    }
    case "BLOCKQUOTE": {
      const quote = serializeFlow(element);
      return quote
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    }
    default:
      return serializeFlow(element);
  }
}

function serializeFlow(parent: ParentNode): string {
  const blocks: string[] = [];
  let inlineNodes: Node[] = [];

  const flushInline = (): void => {
    const text = serializeInlineNodes(inlineNodes);
    if (text) {
      blocks.push(text);
    }
    inlineNodes = [];
  };

  for (const node of parent.childNodes) {
    if (node instanceof Element && FLOW_BLOCK_TAGS.has(node.tagName)) {
      flushInline();
      const serialized = serializeBlock(node);
      const block = node.tagName === "PRE" ? serialized : serialized.trim();
      if (block) {
        blocks.push(block);
      }
    } else {
      inlineNodes.push(node);
    }
  }
  flushInline();

  return blocks.join("\n\n");
}

export function serializeSemanticText(root: ParentNode): string {
  return serializeFlow(root)
    .replace(/[\t ]+\n/g, "\n")
    .replace(/^\n+|\n+$/g, "");
}

export function sanitizeResponseHtml(
  element: Element,
  blockNamespace = "legacy-response",
): SanitizedContent {
  const sourceClone = element.cloneNode(true) as Element;
  preserveExplicitCodeLanguages(sourceClone);
  // Namespace before DOMPurify so clobber-prone source IDs are retained safely.
  namespaceSemanticIds(sourceClone, blockNamespace);

  const sanitized = DOMPurify.sanitize(sourceClone.innerHTML, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|blob:|data:image\/(?:png|jpe?g|gif|webp);base64,|(?!(?:[a-z][a-z0-9+.-]*):))/i,
  });

  const ownerDocument = element.ownerDocument;
  const template = ownerDocument.createElement("template");
  template.innerHTML = sanitized;

  validateSanitizedImages(template.content);

  for (const link of template.content.querySelectorAll("a[href]")) {
    if (!isSafeLinkHref(link.getAttribute("href") ?? "")) {
      link.removeAttribute("href");
      continue;
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  // A block-specific namespace prevents collisions when several blocks are rendered later.
  namespaceSemanticIds(template.content, blockNamespace);

  const container = ownerDocument.createElement("div");
  container.append(template.content.cloneNode(true));

  return {
    html: container.innerHTML,
    text: serializeSemanticText(container),
  };
}
