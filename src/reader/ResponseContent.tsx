import { memo, useLayoutEffect, useRef } from "react";

import type { ExtractedResponse } from "../shared/types";
import { enhanceTables, type TableDisplayState } from "./blockControls";

interface ResponseContentProps {
  response: ExtractedResponse;
  tableSessionStates: Map<string, TableDisplayState>;
}

/**
 * Owns the sanitized response DOM and its imperative table enhancement lifecycle.
 * React toolbar updates must not reconcile this subtree unless the response changes.
 */
export const ResponseContent = memo(function ResponseContent({
  response,
  tableSessionStates,
}: ResponseContentProps) {
  const contentRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!contentRef.current) {
      return;
    }
    return enhanceTables(contentRef.current, {
      responseKey: response.id,
      sessionStates: tableSessionStates,
    });
  }, [response.html, response.id, tableSessionStates]);

  return (
    <article
      ref={contentRef}
      className="rb-content"
      aria-label="Current assistant response"
      dangerouslySetInnerHTML={{ __html: response.html }}
    />
  );
});
