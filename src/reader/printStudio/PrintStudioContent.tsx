import { useLayoutEffect, useRef } from "react";

import type { HighlightRecord } from "../../shared/highlights";
import type { CodeAppearance } from "../../shared/types";
import {
  enhanceTables,
  type TableDisplayState,
  type TableFullscreenCoordinator,
} from "../blockControls";
import { enhanceCodeBlocks } from "../codeControls";
import { enhanceDocumentBlocks } from "../documentBlockControls";
import { renderHighlights } from "../highlights/highlightAnchoring";

interface PrintStudioContentProps {
  responseId: string;
  html: string;
  contentKind: "prompt" | "response";
  highlights: readonly HighlightRecord[];
  showHighlights: boolean;
  includeImages: boolean;
  codeAppearance: CodeAppearance;
  tableSessionStates: Map<string, TableDisplayState>;
  fullscreenCoordinator: TableFullscreenCoordinator;
}

/** Owns a print-only clone of sanitized response HTML; it never mutates Reader or provider DOM. */
export function PrintStudioContent({
  responseId,
  html,
  contentKind,
  highlights,
  showHighlights,
  includeImages,
  codeAppearance,
  tableSessionStates,
  fullscreenCoordinator,
}: PrintStudioContentProps) {
  const contentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root || includeImages) {
      return;
    }
    for (const image of root.querySelectorAll("img")) {
      const figure = image.closest("figure");
      if (figure && root.contains(figure)) {
        figure.remove();
      } else {
        image.remove();
      }
    }
  }, [html, includeImages, responseId]);

  useLayoutEffect(() => {
    if (!contentRef.current) {
      return;
    }
    return enhanceDocumentBlocks(contentRef.current);
  }, [html, includeImages, responseId]);

  useLayoutEffect(() => {
    if (!contentRef.current) {
      return;
    }
    return enhanceTables(contentRef.current, {
      responseKey: `print-studio:${responseId}`,
      sessionStates: tableSessionStates,
      fullscreenCoordinator,
    });
  }, [fullscreenCoordinator, html, includeImages, responseId, tableSessionStates]);

  useLayoutEffect(() => {
    if (!contentRef.current) {
      return;
    }
    return enhanceCodeBlocks(contentRef.current, { appearance: codeAppearance });
  }, [codeAppearance, html, includeImages, responseId]);

  useLayoutEffect(() => {
    if (!contentRef.current || !showHighlights) {
      return;
    }
    const rendered = renderHighlights(contentRef.current, highlights, () => undefined, {
      interactive: false,
    });
    return rendered.cleanup;
  }, [highlights, html, includeImages, responseId, showHighlights]);

  return (
    <article
      ref={contentRef}
      className={`rb-content rb-content--print-studio rb-print-${contentKind}-content`}
      aria-label={contentKind === "prompt" ? "User prompt" : "Assistant response"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
