import { memo } from "react";

import type { DocumentContentBlock } from "../shared/types";

interface PromptDisclosureProps {
  prompt: DocumentContentBlock;
}

export const PromptDisclosure = memo(function PromptDisclosure({ prompt }: PromptDisclosureProps) {
  return (
    <details className="rb-prompt-disclosure rb-print-hidden">
      <summary>View prompt</summary>
      <div
        className="rb-prompt-content"
        aria-label="User prompt"
        dangerouslySetInnerHTML={{ __html: prompt.html }}
      />
    </details>
  );
});
