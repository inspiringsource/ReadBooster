import type { RefObject } from "react";

import type { DocumentContentBlock } from "../shared/types";
import type { TableDisplayState, TableFullscreenCoordinator } from "./blockControls";
import { ResponseContent } from "./ResponseContent";
import { ResponseOutline } from "./ResponseOutline";

interface FocusResponseViewProps {
  response: DocumentContentBlock;
  scrollAreaRef: RefObject<HTMLElement | null>;
  outlineOpen: boolean;
  tableSessionStates: Map<string, TableDisplayState>;
  fullscreenCoordinator: TableFullscreenCoordinator;
}

export function FocusResponseView({
  response,
  scrollAreaRef,
  outlineOpen,
  tableSessionStates,
  fullscreenCoordinator,
}: FocusResponseViewProps) {
  return (
    <>
      <ResponseOutline
        key={`${response.id}:${outlineOpen ? "open" : "closed"}`}
        response={response}
        scrollAreaRef={scrollAreaRef}
        open={outlineOpen}
      />
      <main
        ref={scrollAreaRef}
        className="rb-scroll-area"
        data-rb-scroll-container="vertical"
        aria-label="Focused response content"
      >
        <ResponseContent
          response={response}
          tableSessionStates={tableSessionStates}
          fullscreenCoordinator={fullscreenCoordinator}
          variant="focus"
        />
      </main>
    </>
  );
}
