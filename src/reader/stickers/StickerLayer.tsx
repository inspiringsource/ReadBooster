import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Sticker, StickerPosition } from "../../shared/stickers";
import { StickerCard } from "./StickerCard";
import {
  STICKER_DEFAULT_SAFE_TOP,
  resolveStickerMarginPositions,
  stickerRatioFromTop,
} from "./stickerPositioning";

export interface StickerActions {
  onBeginEdit: (stickerId: string) => void;
  onSave: (stickerId: string, text: string) => void;
  onCancelEdit: (stickerId: string) => void;
  onToggleCollapsed: (stickerId: string) => void;
  onTogglePinned: (stickerId: string) => void;
  onDelete: (stickerId: string) => void;
  onMove: (stickerId: string, position: StickerPosition) => void;
}

interface StickerLayerProps extends StickerActions {
  stickers: readonly Sticker[];
  sectionTitle: string;
  activeEditorId: string | null;
  expandedStickerId: string | null;
}

export function StickerLayer({
  stickers,
  sectionTitle,
  activeEditorId,
  expandedStickerId,
  onBeginEdit,
  onSave,
  onCancelEdit,
  onToggleCollapsed,
  onTogglePinned,
  onDelete,
  onMove,
}: StickerLayerProps) {
  const layerRef = useRef<HTMLElement>(null);
  const [sectionMetrics, setSectionMetrics] = useState({
    height: 600,
    safeTop: STICKER_DEFAULT_SAFE_TOP,
  });
  const ordered = [...stickers].sort(
    (left, right) =>
      left.position.yRatio - right.position.yRatio || left.createdAt - right.createdAt,
  );

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const section = layer?.parentElement;
    if (!layer || !section) {
      return;
    }
    const measure = (): void => {
      const sectionRect = section.getBoundingClientRect();
      const controls = section.querySelector<HTMLElement>(
        ".rb-document-section-header, .rb-focus-sticker-anchor",
      );
      const controlsRect = controls?.getBoundingClientRect();
      if (sectionRect.height <= 0) {
        return;
      }
      const measuredSafeTop = controlsRect
        ? controlsRect.bottom - sectionRect.top + 20
        : STICKER_DEFAULT_SAFE_TOP;
      setSectionMetrics({
        height: sectionRect.height,
        safeTop: Math.max(STICKER_DEFAULT_SAFE_TOP, measuredSafeTop),
      });
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
    observer?.observe(section);
    const controls = section.querySelector<HTMLElement>(
      ".rb-document-section-header, .rb-focus-sticker-anchor",
    );
    if (controls) {
      observer?.observe(controls);
    }
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const resolvedPositions = useMemo(() => {
    const positions = resolveStickerMarginPositions(
      ordered.map((sticker) => ({
        id: sticker.id,
        yRatio: sticker.position.yRatio,
        isPinned: sticker.isPinned,
        isExpanded: sticker.id === expandedStickerId,
      })),
      sectionMetrics.height,
      sectionMetrics.safeTop,
    );
    return new Map(positions.map((position) => [position.id, position.yRatio]));
  }, [expandedStickerId, ordered, sectionMetrics]);

  return (
    <aside
      ref={layerRef}
      className="rb-sticker-layer rb-print-hidden"
      aria-label={`Stickers for section: ${sectionTitle}`}
    >
      {ordered.some((sticker) => sticker.id === expandedStickerId) ? (
        <button
          type="button"
          className="rb-sticker-drawer-backdrop"
          aria-label="Close expanded sticker"
          onClick={() => onToggleCollapsed(expandedStickerId!)}
        />
      ) : null}
      {ordered.map((sticker) => {
        const isExpanded = sticker.id === expandedStickerId;
        const autoPosition: StickerPosition = {
          xRatio: 1,
          yRatio: 0,
        };
        const sourcePosition = sticker.isPinned ? sticker.position : autoPosition;
        const displayPosition = {
          ...sourcePosition,
          yRatio: resolvedPositions.get(sticker.id) ?? sourcePosition.yRatio,
        };
        return (
          <StickerCard
            key={sticker.id}
            sticker={sticker}
            sectionTitle={sectionTitle}
            displayPosition={displayPosition}
            minimumYRatio={stickerRatioFromTop(sectionMetrics.safeTop, sectionMetrics.height)}
            isExpanded={isExpanded}
            isEditing={activeEditorId === sticker.id}
            onBeginEdit={() => onBeginEdit(sticker.id)}
            onSave={(text) => onSave(sticker.id, text)}
            onCancelEdit={() => onCancelEdit(sticker.id)}
            onToggleCollapsed={() => onToggleCollapsed(sticker.id)}
            onTogglePinned={() => onTogglePinned(sticker.id)}
            onDelete={() => onDelete(sticker.id)}
            onMove={(position) => onMove(sticker.id, position)}
          />
        );
      })}
    </aside>
  );
}
