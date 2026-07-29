import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  HIGHLIGHT_STYLES,
  type HighlightRecord,
  type HighlightStyle,
} from "../../shared/highlights";
import { selectionToHighlightDraft, type HighlightSelectionDraft } from "./highlightAnchoring";

interface ActiveHighlightTarget {
  readonly highlight: HighlightRecord;
  readonly rect: DOMRect;
}

interface HighlightToolbarProps {
  readerRef: RefObject<HTMLDivElement | null>;
  activeHighlight: ActiveHighlightTarget | null;
  onCreate: (draft: HighlightSelectionDraft, style: HighlightStyle) => void;
  onChangeStyle: (highlightId: string, style: HighlightStyle) => void;
  onRemove: (highlightId: string) => void;
  onCloseActive: () => void;
}

const STYLE_LABELS: Record<HighlightStyle, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
};

function selectionFromRoot(root: Node): Selection | null {
  const rootSelection = (
    root.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }
  ).getSelection?.();
  return rootSelection ?? document.getSelection();
}

export function HighlightToolbar({
  readerRef,
  activeHighlight,
  onCreate,
  onChangeStyle,
  onRemove,
  onCloseActive,
}: HighlightToolbarProps) {
  const [draft, setDraft] = useState<HighlightSelectionDraft | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const focusAfterKeyboardSelectionRef = useRef(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) {
      return;
    }
    const updateFromSelection = (event: PointerEvent | KeyboardEvent): void => {
      if (activeHighlight) {
        return;
      }
      const selection = selectionFromRoot(reader);
      focusAfterKeyboardSelectionRef.current = event instanceof KeyboardEvent;
      setDraft(selection ? selectionToHighlightDraft(selection, reader) : null);
    };
    const clearCollapsedSelection = (): void => {
      const selection = selectionFromRoot(reader);
      if (!selection || selection.isCollapsed) {
        setDraft(null);
      }
    };
    reader.addEventListener("pointerup", updateFromSelection);
    reader.addEventListener("keyup", updateFromSelection);
    document.addEventListener("selectionchange", clearCollapsedSelection);
    return () => {
      reader.removeEventListener("pointerup", updateFromSelection);
      reader.removeEventListener("keyup", updateFromSelection);
      document.removeEventListener("selectionchange", clearCollapsedSelection);
    };
  }, [activeHighlight, readerRef]);

  useEffect(() => {
    if (!draft || !focusAfterKeyboardSelectionRef.current) {
      return;
    }
    focusAfterKeyboardSelectionRef.current = false;
    toolbarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [draft]);

  useEffect(() => {
    if (!draft && !activeHighlight) {
      return;
    }
    let frame = 0;
    const handleResize = (): void => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setLayoutVersion((value) => value + 1));
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeHighlight, draft]);

  const sourceRect = activeHighlight?.rect ?? draft?.rect ?? null;
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !sourceRect) {
      return;
    }
    const margin = 8;
    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const left = Math.min(
      window.innerWidth - width - margin,
      Math.max(margin, sourceRect.left + sourceRect.width / 2 - width / 2),
    );
    const preferredTop = sourceRect.top - height - 10;
    const top =
      preferredTop >= margin
        ? preferredTop
        : Math.min(window.innerHeight - height - margin, sourceRect.bottom + 10);
    setPosition({ left, top: Math.max(margin, top) });
  }, [activeHighlight, draft, layoutVersion, sourceRect]);

  useEffect(() => {
    if (!draft && !activeHighlight) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setDraft(null);
      onCloseActive();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeHighlight, draft, onCloseActive]);

  useEffect(() => {
    if (!draft && !activeHighlight) {
      return;
    }
    const handleOutsidePointer = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (
        path.includes(toolbarRef.current as EventTarget) ||
        path.some(
          (target) => target instanceof Element && target.matches("mark[data-rb-highlight-id]"),
        )
      ) {
        return;
      }
      setDraft(null);
      onCloseActive();
    };
    window.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => window.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [activeHighlight, draft, onCloseActive]);

  if (!draft && !activeHighlight) {
    return null;
  }

  const chooseStyle = (style: HighlightStyle): void => {
    if (activeHighlight) {
      onChangeStyle(activeHighlight.highlight.id, style);
    } else if (draft) {
      onCreate(draft, style);
      selectionFromRoot(readerRef.current ?? document)?.removeAllRanges();
      setDraft(null);
    }
  };

  return (
    <div
      ref={toolbarRef}
      className="rb-highlight-toolbar rb-print-hidden"
      data-rb-highlight-ui="true"
      role="toolbar"
      aria-label={activeHighlight ? "Edit highlight" : "Create highlight"}
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.preventDefault()}
    >
      <span className="rb-highlight-toolbar-label">
        {activeHighlight ? "Highlight" : "Highlight with"}
      </span>
      <div className="rb-highlight-style-options">
        {HIGHLIGHT_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            className={`rb-highlight-style rb-highlight-style--${style}`}
            aria-label={`${activeHighlight ? "Change highlight to" : "Highlight with"} ${STYLE_LABELS[style].toLowerCase()}`}
            aria-pressed={activeHighlight?.highlight.style === style}
            title={STYLE_LABELS[style]}
            onClick={() => chooseStyle(style)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
      {activeHighlight ? (
        <button
          type="button"
          className="rb-highlight-remove"
          onClick={() => onRemove(activeHighlight.highlight.id)}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}
