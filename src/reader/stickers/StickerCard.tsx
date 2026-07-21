import {
  useEffect,
  useId,
  useLayoutEffect,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  STICKER_TEXT_MAX_LENGTH,
  clampStickerRatio,
  normalizeStickerText,
  type Sticker,
  type StickerPosition,
} from "../../shared/stickers";
import { STICKER_PIN_SIZE, stickerRatioFromTop, stickerTopFromRatio } from "./stickerPositioning";
import { calculateStickerMenuPosition, type StickerMenuPosition } from "./stickerMenuPositioning";
import { StickerMenuPortalContext } from "./StickerMenuPortalContext";

interface StickerCardProps {
  sticker: Sticker;
  sectionTitle: string;
  displayPosition: StickerPosition;
  minimumYRatio: number;
  isExpanded: boolean;
  isEditing: boolean;
  onBeginEdit: () => void;
  onSave: (text: string) => void;
  onCancelEdit: () => void;
  onToggleCollapsed: () => void;
  onTogglePinned: () => void;
  onDelete: () => void;
  onMove: (position: StickerPosition) => void;
}

function positionStyle(position: StickerPosition, isExpanded: boolean): CSSProperties {
  const yPercent = position.yRatio * 100;
  return {
    // The document section ends before the surface's outer padding. Put the default
    // card in that unused margin while preserving a small section-relative drag range.
    right: isExpanded ? `${(1 - position.xRatio) * 72 - 64}px` : "0px",
    top: `calc(${yPercent}% - ${position.yRatio * STICKER_PIN_SIZE}px)`,
    transform: "none",
  };
}

function NoteIcon() {
  return (
    <svg
      className="rb-sticker-note-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      data-rb-sticker-note-icon
    >
      <path d="M5.5 3.75h9.75l3.25 3.25v13.25H5.5z" />
      <path d="M15.25 3.75V7h3.25M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
    </svg>
  );
}

export function StickerCard({
  sticker,
  sectionTitle,
  displayPosition,
  minimumYRatio,
  isExpanded,
  isEditing,
  onBeginEdit,
  onSave,
  onCancelEdit,
  onToggleCollapsed,
  onTogglePinned,
  onDelete,
  onMove,
}: StickerCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const dragPositionRef = useRef(displayPosition);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [draft, setDraft] = useState(sticker.text);
  const [validation, setValidation] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<StickerMenuPosition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragPosition, setDragPosition] = useState<StickerPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const suppressClickRef = useRef(false);
  const menuId = useId();
  const menuPortal = useContext(StickerMenuPortalContext);

  useEffect(() => {
    if (isEditing) {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.select();
    }
  }, [isEditing]);

  useEffect(
    () => () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (isExpanded || !menuOpen) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setMenuOpen(false);
      setMenuPosition(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isExpanded, menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuPortal) {
      return;
    }
    const updatePosition = (): void => {
      const trigger = menuTriggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) {
        return;
      }
      setMenuPosition(
        calculateStickerMenuPosition(
          trigger.getBoundingClientRect(),
          menu.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };

    updatePosition();
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"], button')?.focus();
    const resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(updatePosition) : undefined;
    if (menuTriggerRef.current) {
      resizeObserver?.observe(menuTriggerRef.current);
    }
    if (menuRef.current) {
      resizeObserver?.observe(menuRef.current);
    }
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [confirmDelete, menuOpen, menuPortal]);

  const closeMenu = (restoreFocus = false): void => {
    setConfirmDelete(false);
    setMenuOpen(false);
    setMenuPosition(null);
    if (restoreFocus) {
      queueMicrotask(() => menuTriggerRef.current?.focus());
    }
  };

  const saveDraft = (): void => {
    const normalized = normalizeStickerText(draft);
    if (!normalized) {
      if (!sticker.text && !draft.trim()) {
        onCancelEdit();
        return;
      }
      setValidation(
        draft.trim().length > STICKER_TEXT_MAX_LENGTH
          ? `Stickers must be ${STICKER_TEXT_MAX_LENGTH.toLocaleString()} characters or fewer.`
          : "Write a note before saving.",
      );
      return;
    }
    onSave(normalized);
  };

  const beginEditing = (): void => {
    setDraft(sticker.text);
    setValidation("");
    onBeginEdit();
  };

  const beginDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) {
      return;
    }
    const card = cardRef.current;
    const layer = card?.parentElement;
    if (!card || !layer) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const start = displayPosition;
    dragPositionRef.current = start;
    const layerRect = layer.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const availableY = Math.max(1, layerRect.height - STICKER_PIN_SIZE);
    const maximumTop = Math.max(0, layerRect.height - cardRect.height);
    const maximumRatio = stickerRatioFromTop(maximumTop, layerRect.height);
    const effectiveMinimumRatio = Math.min(minimumYRatio, maximumRatio);
    let moved = false;

    const move = (moveEvent: globalThis.PointerEvent): void => {
      const deltaY = moveEvent.clientY - startY;
      if (Math.abs(deltaY) > 4) {
        moved = true;
        setIsDragging(true);
      }
      const next = {
        xRatio: start.xRatio,
        yRatio: Math.max(
          effectiveMinimumRatio,
          Math.min(maximumRatio, clampStickerRatio(start.yRatio + deltaY / availableY)),
        ),
      };
      dragPositionRef.current = next;
      setDragPosition(next);
    };
    const cleanup = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    const finish = (): void => {
      cleanup();
      dragCleanupRef.current = null;
      setIsDragging(false);
      if (moved) {
        suppressClickRef.current = true;
        onMove(dragPositionRef.current);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      setDragPosition(null);
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  };

  const moveWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const card = cardRef.current;
    const layerHeight = card?.parentElement?.getBoundingClientRect().height ?? 0;
    const cardHeight = card?.getBoundingClientRect().height ?? STICKER_PIN_SIZE;
    const maximumRatio = stickerRatioFromTop(Math.max(0, layerHeight - cardHeight), layerHeight);
    const effectiveMinimumRatio = Math.min(minimumYRatio, maximumRatio);
    const pixelDelta = (event.shiftKey ? 24 : 8) * (event.key === "ArrowUp" ? -1 : 1);
    const currentPosition = dragPosition ?? displayPosition;
    const currentTop = stickerTopFromRatio(currentPosition.yRatio, layerHeight);
    const next = {
      xRatio: currentPosition.xRatio,
      yRatio: Math.max(
        effectiveMinimumRatio,
        Math.min(maximumRatio, stickerRatioFromTop(currentTop + pixelDelta, layerHeight)),
      ),
    };
    dragPositionRef.current = next;
    setDragPosition(next);
    onMove(next);
  };

  return (
    <aside
      ref={cardRef}
      className={`rb-sticker${isExpanded ? " rb-sticker--expanded" : " rb-sticker--collapsed"}${isDragging ? " rb-sticker--dragging" : ""}`}
      style={positionStyle(dragPosition ?? displayPosition, isExpanded)}
      data-rb-sticker-ui
      data-rb-sticker-id={sticker.id}
      data-rb-sticker-y-ratio={(dragPosition ?? displayPosition).yRatio}
      aria-label={`Sticker attached to section: ${sectionTitle}`}
    >
      {isExpanded ? (
        <div className="rb-sticker-header">
          <button
            type="button"
            className="rb-sticker-drag"
            aria-label={`Move sticker attached to section: ${sectionTitle}`}
            title="Drag to move; arrow keys also move this sticker"
            onPointerDown={beginDrag}
            onKeyDown={moveWithKeyboard}
          >
            <span aria-hidden="true">⠿</span>
          </button>
          <span
            className="rb-sticker-pin-state"
            aria-label={sticker.isPinned ? "Pinned" : "Unpinned"}
          >
            <span aria-hidden="true">{sticker.isPinned ? "●" : "○"}</span>
          </span>
          <button
            ref={menuTriggerRef}
            type="button"
            className="rb-sticker-menu-trigger"
            aria-label="Sticker actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onClick={() => {
              setConfirmDelete(false);
              setMenuPosition(null);
              setMenuOpen((open) => !open);
            }}
          >
            <span aria-hidden="true">•••</span>
          </button>
        </div>
      ) : null}

      {isExpanded && isEditing ? (
        <div className="rb-sticker-editor" data-rb-sticker-editor>
          <label htmlFor={`rb-sticker-editor-${sticker.id}`}>Sticker note</label>
          <textarea
            ref={textareaRef}
            id={`rb-sticker-editor-${sticker.id}`}
            value={draft}
            maxLength={STICKER_TEXT_MAX_LENGTH}
            placeholder="Write a note…"
            aria-invalid={validation ? "true" : undefined}
            aria-describedby={validation ? `rb-sticker-error-${sticker.id}` : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setValidation("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancelEdit();
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                saveDraft();
              }
            }}
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (!(next instanceof Node) || !cardRef.current?.contains(next)) {
                saveDraft();
              }
            }}
          />
          <div className="rb-sticker-editor-actions">
            <span>
              {draft.length}/{STICKER_TEXT_MAX_LENGTH}
            </span>
            <button type="button" onClick={onCancelEdit}>
              Cancel
            </button>
            <button type="button" onClick={saveDraft}>
              Save
            </button>
          </div>
          {validation ? (
            <p id={`rb-sticker-error-${sticker.id}`} role="alert">
              {validation}
            </p>
          ) : null}
        </div>
      ) : !isExpanded ? (
        <button
          type="button"
          className="rb-sticker-collapsed-content"
          onPointerDown={beginDrag}
          onKeyDown={moveWithKeyboard}
          onClick={() => {
            if (!suppressClickRef.current) {
              onToggleCollapsed();
            }
          }}
          aria-label={`Open sticker attached to “${sectionTitle}”`}
          title="Open sticker"
        >
          <NoteIcon />
          {sticker.text ? <span className="rb-sticker-saved-dot" aria-hidden="true" /> : null}
          <span className="rb-visually-hidden">
            {sticker.text.slice(0, 42)}
            {sticker.text.length > 42 ? "…" : ""}
          </span>
        </button>
      ) : (
        <button type="button" className="rb-sticker-text" onClick={beginEditing}>
          {sticker.text}
        </button>
      )}

      {isExpanded && menuOpen && menuPortal
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="rb-sticker-menu"
              role="menu"
              aria-label="Sticker actions"
              data-placement={menuPosition?.placement ?? "below"}
              style={{
                left: `${menuPosition?.left ?? 8}px`,
                top: `${menuPosition?.top ?? 8}px`,
                visibility: menuPosition ? "visible" : "hidden",
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeMenu(true);
                }
              }}
            >
              {!confirmDelete ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="rb-sticker-menu-item"
                    onClick={() => {
                      closeMenu();
                      beginEditing();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="rb-sticker-menu-item"
                    onClick={() => {
                      closeMenu();
                      onToggleCollapsed();
                    }}
                  >
                    Collapse
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="rb-sticker-menu-item"
                    onClick={() => {
                      closeMenu();
                      onTogglePinned();
                    }}
                  >
                    {sticker.isPinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="rb-sticker-menu-item rb-sticker-menu-delete"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <div
                  className="rb-sticker-delete-confirm"
                  role="alertdialog"
                  aria-label="Delete sticker?"
                >
                  <p>Delete this sticker?</p>
                  <button
                    type="button"
                    className="rb-sticker-menu-item"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rb-sticker-menu-item rb-sticker-menu-delete"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>,
            menuPortal,
          )
        : null}
    </aside>
  );
}
