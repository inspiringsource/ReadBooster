import DOMPurify from "dompurify";

import {
  READBOOSTER_CONTENT_BLOCK_ATTRIBUTE,
  READBOOSTER_SOURCE_METADATA_ATTRIBUTE,
} from "../shared/contentKinds";
import { serializeSemanticText } from "../shared/semanticText";

export { serializeSemanticText } from "../shared/semanticText";

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
  "cite",
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

export function normalizeSupportedCodeLanguageLabel(value: string): string | null {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^(?:language|lang)\s*:\s*/, "");
  return LANGUAGE_ALIASES[normalized] ?? null;
}

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

export function isKnownFaviconSource(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && /^\/s2\/favicons(?:\/|$)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isSafeLinkHref(value: string): boolean {
  const href = value.trim();
  return /^(?:https?:|mailto:|tel:)/i.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function validateSanitizedImages(root: ParentNode): void {
  for (const image of root.querySelectorAll<HTMLImageElement>("img")) {
    const source = image.getAttribute("src") ?? "";
    if (!isSafeImageSource(source) || isKnownFaviconSource(source)) {
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

export interface SanitizeResponseOptions {
  preserveInternalContentKinds?: boolean;
  preserveSourceMetadata?: boolean;
}

export function sanitizeResponseHtml(
  element: Element,
  blockNamespace = "legacy-response",
  options: SanitizeResponseOptions = {},
): SanitizedContent {
  const sourceClone = element.cloneNode(true) as Element;
  preserveExplicitCodeLanguages(sourceClone);
  // Namespace before DOMPurify so clobber-prone source IDs are retained safely.
  namespaceSemanticIds(sourceClone, blockNamespace);

  const sanitized = DOMPurify.sanitize(sourceClone.innerHTML, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [
      ...ALLOWED_ATTR,
      ...(options.preserveInternalContentKinds ? [READBOOSTER_CONTENT_BLOCK_ATTRIBUTE] : []),
      ...(options.preserveSourceMetadata ? [READBOOSTER_SOURCE_METADATA_ATTRIBUTE] : []),
    ],
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
