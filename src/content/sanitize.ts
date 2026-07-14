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
  "div",
  "span",
];

const ALLOWED_ATTR = ["href", "title", "colspan", "rowspan", "scope", "start", "reversed"];

export interface SanitizedContent {
  html: string;
  text: string;
}

export function sanitizeResponseHtml(element: Element): SanitizedContent {
  const sanitized = DOMPurify.sanitize(element.innerHTML, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["style"],
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized;

  for (const link of template.content.querySelectorAll("a[href]")) {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  const container = document.createElement("div");
  container.append(template.content.cloneNode(true));

  return {
    html: container.innerHTML,
    text: container.textContent?.trim() ?? "",
  };
}
