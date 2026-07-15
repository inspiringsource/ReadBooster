import type { ConversationDocument, DocumentContentBlock } from "../shared/types";
import { buildOutline, flattenOutline, type OutlineItem } from "./outline";

export type ReaderMode = "document" | "focus";
export type SectionTitleSource = "heading" | "prompt" | "fallback";

export interface ConversationSection {
  id: string;
  turnId: string;
  responseBlockId: string;
  index: number;
  title: string;
  titleSource: SectionTitleSource;
  prompt: DocumentContentBlock | null;
  response: DocumentContentBlock;
  outline: OutlineItem[];
}

export interface ConversationOutlineGroup {
  id: string;
  turnId: string;
  responseBlockId: string;
  title: string;
  targetSectionId: string;
  children: OutlineItem[];
}

const TITLE_LIMIT = 80;
const LEADING_ENUMERATION = /^(?:\(\d{1,3}\)|\d{1,3}[.)])(?:\s+|$)/;
const LEADING_BULLET = /^[*\-–—•‣▪◦](?:\s+|$)/;

function safeIdPart(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "item"
  );
}

export function conciseTitle(value: string, limit = TITLE_LIMIT): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  const available = Math.max(1, limit - 1);
  const candidate = normalized.slice(0, available + 1);
  const boundary = candidate.lastIndexOf(" ");
  const cutAt = boundary >= Math.floor(available * 0.55) ? boundary : available;
  return `${normalized.slice(0, cutAt).trimEnd()}…`;
}

/** Normalizes only ReadBooster's derived title, never the original response heading. */
export function normalizeSectionTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.replace(LEADING_ENUMERATION, "").replace(LEADING_BULLET, "").trim();
}

function sectionTitle(
  responseOutline: readonly OutlineItem[],
  prompt: DocumentContentBlock | null,
  sectionIndex: number,
): { title: string; titleSource: SectionTitleSource } {
  const firstHeading = flattenOutline(responseOutline)[0];
  const headingTitle = conciseTitle(normalizeSectionTitle(firstHeading?.text ?? ""));
  if (headingTitle) {
    return { title: headingTitle, titleSource: "heading" };
  }

  const promptTitle = conciseTitle(normalizeSectionTitle(prompt?.text ?? ""));
  if (promptTitle) {
    return { title: promptTitle, titleSource: "prompt" };
  }

  return { title: `Response ${sectionIndex + 1}`, titleSource: "fallback" };
}

/** Derives the complete reader presentation once from a normalized conversation document. */
export function deriveConversationSections(
  conversation: ConversationDocument,
): ConversationSection[] {
  const sections: ConversationSection[] = [];

  for (const turn of conversation.turns) {
    if (!turn.response) {
      continue;
    }

    const index = sections.length;
    const outline = buildOutline([turn.response]);
    const { title, titleSource } = sectionTitle(outline, turn.prompt, index);
    sections.push({
      id: `rb-section-${safeIdPart(turn.id)}-${safeIdPart(turn.response.id)}`,
      turnId: turn.id,
      responseBlockId: turn.response.id,
      index,
      title,
      titleSource,
      prompt: turn.prompt,
      response: turn.response,
      outline,
    });
  }

  return sections;
}

export function deriveConversationOutline(
  sections: readonly ConversationSection[],
): ConversationOutlineGroup[] {
  return sections.map((section) => {
    let children = section.outline;
    if (section.titleSource === "heading") {
      const firstHeading = flattenOutline(section.outline)[0];
      const firstRoot = section.outline[0];
      if (firstHeading && firstRoot?.targetHeadingId === firstHeading.targetHeadingId) {
        children = [...firstRoot.children, ...section.outline.slice(1)];
      }
    }

    return {
      id: `rb-outline-group-${safeIdPart(section.turnId)}-${safeIdPart(section.responseBlockId)}`,
      turnId: section.turnId,
      responseBlockId: section.responseBlockId,
      title: section.title,
      targetSectionId: section.id,
      children,
    };
  });
}

export function conversationCopyText(sections: readonly ConversationSection[]): string {
  return sections
    .map((section) => `${section.title}\n\n${section.response.text}`.trim())
    .join("\n\n---\n\n");
}
