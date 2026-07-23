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
  "SECTION",
  "SUMMARY",
  "TABLE",
  "UL",
]);

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
