import { memo, useLayoutEffect, useRef } from "react";

import type { CodeAppearance, DocumentContentBlock } from "../shared/types";
import {
  enhanceTables,
  type TableDisplayState,
  type TableFullscreenCoordinator,
} from "./blockControls";
import { enhanceCodeBlocks } from "./codeControls";

interface ResponseContentProps {
  response: DocumentContentBlock;
  tableSessionStates: Map<string, TableDisplayState>;
  variant?: "document" | "focus";
  fullscreenCoordinator?: TableFullscreenCoordinator;
  codeAppearance: CodeAppearance;
}

/**
 * Owns the sanitized response DOM and its imperative table enhancement lifecycle.
 * React toolbar updates must not reconcile this subtree unless the response changes.
 */
export const ResponseContent = memo(function ResponseContent({
  response,
  tableSessionStates,
  variant = "focus",
  fullscreenCoordinator,
  codeAppearance,
}: ResponseContentProps) {
  const contentRef = useRef<HTMLElement>(null);

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

  return (
    <article
      ref={contentRef}
      className={`rb-content rb-content--${variant}`}
      aria-label={variant === "document" ? "Assistant response" : "Current assistant response"}
      dangerouslySetInnerHTML={{ __html: response.html }}
    />
  );
});
