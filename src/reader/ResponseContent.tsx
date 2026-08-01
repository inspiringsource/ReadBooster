import { memo, useLayoutEffect, useRef } from "react";

import type { HighlightRecord } from "../shared/highlights";
import type { CodeAppearance, DocumentContentBlock } from "../shared/types";
import {
  enhanceTables,
  type TableDisplayState,
  type TableFullscreenCoordinator,
} from "./blockControls";
import { enhanceCodeBlocks } from "./codeControls";
import { enhanceDocumentBlocks } from "./documentBlockControls";
import { renderHighlights } from "./highlights/highlightAnchoring";

interface ResponseContentProps {
  response: DocumentContentBlock;
  tableSessionStates: Map<string, TableDisplayState>;
  variant?: "document" | "focus";
  fullscreenCoordinator?: TableFullscreenCoordinator;
  codeAppearance: CodeAppearance;
  highlights?: readonly HighlightRecord[];
  onHighlightActivate?: (highlightId: string, target: HTMLElement) => void;
}

/**
 * Owns the sanitized response DOM and its imperative table enhancement lifecycle.
 * React toolbar updates must not reconcile this subtree unless the response changes.
 */
export const ResponseContent = memo(
  function ResponseContent({
    response,
    tableSessionStates,
    variant = "focus",
    fullscreenCoordinator,
    codeAppearance,
    highlights = [],
    onHighlightActivate = () => undefined,
  }: ResponseContentProps) {
    const contentRef = useRef<HTMLElement>(null);

    useLayoutEffect(() => {
      if (!contentRef.current) {
        return;
      }
      return enhanceDocumentBlocks(contentRef.current);
    }, [response.html, response.id]);

    useLayoutEffect(() => {
      if (!contentRef.current) {
        return;
      }
      return enhanceTables(contentRef.current, {
        responseKey: response.id,
        sessionStates: tableSessionStates,
        fullscreenCoordinator,
      });
    }, [fullscreenCoordinator, response.html, response.id, tableSessionStates]);

    useLayoutEffect(() => {
      if (!contentRef.current) {
        return;
      }
      return enhanceCodeBlocks(contentRef.current, { appearance: codeAppearance });
    }, [codeAppearance, response.html, response.id]);

    useLayoutEffect(() => {
      if (!contentRef.current) {
        return;
      }
      const rendered = renderHighlights(contentRef.current, highlights, onHighlightActivate);
      return rendered.cleanup;
    }, [highlights, onHighlightActivate, response.html, response.id]);

    return (
      <article
        ref={contentRef}
        className={`rb-content rb-content--${variant}`}
        data-rb-response-id={response.id}
        aria-label={variant === "document" ? "Assistant response" : "Current assistant response"}
        dangerouslySetInnerHTML={{ __html: response.html }}
      />
    );
  },
  (previous, next) =>
    previous.response.id === next.response.id &&
    previous.response.html === next.response.html &&
    previous.tableSessionStates === next.tableSessionStates &&
    previous.variant === next.variant &&
    previous.fullscreenCoordinator === next.fullscreenCoordinator &&
    previous.codeAppearance === next.codeAppearance &&
    (previous.highlights?.length ?? 0) === (next.highlights?.length ?? 0) &&
    (previous.highlights ?? []).every((highlight, index) => {
      const candidate = next.highlights?.[index];
      return candidate?.id === highlight.id && candidate.updatedAt === highlight.updatedAt;
    }),
);
