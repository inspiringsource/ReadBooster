import type { RefObject } from "react";

import type { CodeAppearance } from "../shared/types";
import type { Sticker } from "../shared/stickers";
import type { TableDisplayState, TableFullscreenCoordinator } from "./blockControls";
import { ResponseContent } from "./ResponseContent";
import { ResponseOutline } from "./ResponseOutline";
import type { ConversationSection } from "./presentation";
import { StickerAnchor } from "./stickers/StickerAnchor";
import { StickerLayer, type StickerActions } from "./stickers/StickerLayer";

interface FocusResponseViewProps extends StickerActions {
  section: ConversationSection;
  stickers: readonly Sticker[];
  activeStickerEditorId: string | null;
  expandedStickerId: string | null;
  onAddSticker: () => void;
  scrollAreaRef: RefObject<HTMLElement | null>;
  outlineOpen: boolean;
  tableSessionStates: Map<string, TableDisplayState>;
  fullscreenCoordinator: TableFullscreenCoordinator;
  codeAppearance: CodeAppearance;
}

export function FocusResponseView({
  section,
  stickers,
  activeStickerEditorId,
  expandedStickerId,
  onAddSticker,
  scrollAreaRef,
  outlineOpen,
  tableSessionStates,
  fullscreenCoordinator,
  codeAppearance,
  onBeginEdit,
  onSave,
  onCancelEdit,
  onToggleCollapsed,
  onTogglePinned,
  onDelete,
  onMove,
}: FocusResponseViewProps) {
  const response = section.response;
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
        <section
          className="rb-focus-section"
          data-rb-section-id={section.id}
          aria-label={section.title}
        >
          <div className="rb-section-reading-column">
            <div className="rb-focus-sticker-anchor">
              <StickerAnchor
                sectionId={section.id}
                sectionTitle={section.title}
                onAdd={onAddSticker}
              />
            </div>
            <ResponseContent
              response={response}
              tableSessionStates={tableSessionStates}
              fullscreenCoordinator={fullscreenCoordinator}
              variant="focus"
              codeAppearance={codeAppearance}
            />
          </div>
          <StickerLayer
            stickers={stickers}
            sectionTitle={section.title}
            activeEditorId={activeStickerEditorId}
            expandedStickerId={expandedStickerId}
            onBeginEdit={onBeginEdit}
            onSave={onSave}
            onCancelEdit={onCancelEdit}
            onToggleCollapsed={onToggleCollapsed}
            onTogglePinned={onTogglePinned}
            onDelete={onDelete}
            onMove={onMove}
          />
        </section>
      </main>
    </>
  );
}
