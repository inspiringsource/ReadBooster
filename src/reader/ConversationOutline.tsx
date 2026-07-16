import { useLayoutEffect, useRef, useState } from "react";

import {
  CUSTOM_SECTION_TITLE_MAX_LENGTH,
  normalizeCustomSectionTitle,
} from "../shared/sectionTitleOverrides";
import type { OutlineItem } from "./outline";
import type { ConversationOutlineGroup } from "./presentation";

interface ConversationOutlineProps {
  groups: readonly ConversationOutlineGroup[];
  activeSectionId: string;
  activeHeadingId: string | null;
  open: boolean;
  onSelectGroup: (group: ConversationOutlineGroup) => void;
  onSelectHeading: (group: ConversationOutlineGroup, item: OutlineItem) => void;
  onRenameSection: (group: ConversationOutlineGroup, title: string) => Promise<void>;
  onRestoreAutomaticTitle: (group: ConversationOutlineGroup) => Promise<void>;
  titleStatus: string;
}

function HeadingItems({
  items,
  activeHeadingId,
  onSelect,
}: {
  items: readonly OutlineItem[];
  activeHeadingId: string | null;
  onSelect: (item: OutlineItem) => void;
}) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="rb-outline-link"
            aria-current={activeHeadingId === item.targetHeadingId ? "location" : undefined}
            onClick={() => onSelect(item)}
          >
            {item.text}
          </button>
          {item.children.length > 0 ? (
            <HeadingItems
              items={item.children}
              activeHeadingId={activeHeadingId}
              onSelect={onSelect}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ConversationOutline({
  groups,
  activeSectionId,
  activeHeadingId,
  open,
  onSelectGroup,
  onSelectHeading,
  onRenameSection,
  onRestoreAutomaticTitle,
  titleStatus,
}: ConversationOutlineProps) {
  const [expandedOverrides, setExpandedOverrides] = useState(() => new Map<string, boolean>());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingError, setEditingError] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoringGroupId, setRestoringGroupId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusGroupIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (editingGroupId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingGroupId]);

  useLayoutEffect(() => {
    const focusGroupId = pendingFocusGroupIdRef.current;
    const button = focusGroupId ? renameButtonRefs.current.get(focusGroupId) : null;
    if (button) {
      button.focus();
      pendingFocusGroupIdRef.current = null;
    }
  });

  const beginRename = (group: ConversationOutlineGroup): void => {
    if (saving || restoringGroupId) {
      return;
    }
    setEditingGroupId(group.id);
    setEditingValue(group.title);
    setEditingError("");
  };

  const cancelRename = (groupId: string): void => {
    setEditingGroupId(null);
    setEditingError("");
    setSaving(false);
    pendingFocusGroupIdRef.current = groupId;
  };

  const saveRename = async (group: ConversationOutlineGroup): Promise<void> => {
    const normalized = normalizeCustomSectionTitle(editingValue);
    if (!normalized) {
      const compacted = editingValue.replace(/\s+/g, " ").trim();
      setEditingError(
        compacted.length > CUSTOM_SECTION_TITLE_MAX_LENGTH
          ? `Custom titles must be ${CUSTOM_SECTION_TITLE_MAX_LENGTH} characters or fewer.`
          : "Enter a section title before saving.",
      );
      return;
    }
    setSaving(true);
    await onRenameSection(group, normalized);
    setSaving(false);
    setEditingGroupId(null);
    setEditingError("");
    pendingFocusGroupIdRef.current = group.id;
  };

  const restoreAutomaticTitle = async (group: ConversationOutlineGroup): Promise<void> => {
    setRestoringGroupId(group.id);
    await onRestoreAutomaticTitle(group);
    setRestoringGroupId(null);
    pendingFocusGroupIdRef.current = group.id;
  };

  const toggleGroup = (group: ConversationOutlineGroup, currentlyExpanded: boolean): void => {
    setExpandedOverrides((current) => {
      const next = new Map(current);
      next.set(group.id, !currentlyExpanded);
      return next;
    });
  };

  return (
    <aside
      id="rb-response-outline"
      className="rb-outline rb-conversation-outline rb-print-hidden"
      aria-label="Conversation outline"
      hidden={!open}
    >
      <h2>Conversation</h2>
      <p className="rb-section-title-status" role="status" aria-live="polite">
        {titleStatus}
      </p>
      <nav aria-label="Conversation sections">
        <ol className="rb-outline-groups">
          {groups.map((group) => {
            const active = group.targetSectionId === activeSectionId;
            const expanded = expandedOverrides.get(group.id) ?? active;
            const editing = editingGroupId === group.id;
            return (
              <li key={group.id} className="rb-outline-group">
                {editing ? (
                  <form
                    className="rb-section-title-editor"
                    data-rb-section-title-editor="true"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveRename(group);
                    }}
                  >
                    <label htmlFor={`rb-section-title-input-${group.id}`}>Custom title</label>
                    <input
                      ref={inputRef}
                      id={`rb-section-title-input-${group.id}`}
                      type="text"
                      value={editingValue}
                      maxLength={CUSTOM_SECTION_TITLE_MAX_LENGTH}
                      aria-invalid={Boolean(editingError)}
                      aria-describedby={
                        editingError ? `rb-section-title-error-${group.id}` : undefined
                      }
                      onChange={(event) => {
                        setEditingValue(event.target.value);
                        setEditingError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          cancelRename(group.id);
                        } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          void saveRename(group);
                        }
                      }}
                    />
                    <div className="rb-section-title-editor-actions">
                      <button type="submit" disabled={saving}>
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => cancelRename(group.id)}
                      >
                        Cancel
                      </button>
                    </div>
                    {editingError ? (
                      <p id={`rb-section-title-error-${group.id}`} role="alert">
                        {editingError}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <div className="rb-outline-group-row">
                    <button
                      type="button"
                      className="rb-outline-group-link"
                      aria-current={active ? "location" : undefined}
                      onClick={() => onSelectGroup(group)}
                    >
                      {group.title}
                    </button>
                    {group.hasCustomTitle ? (
                      <span
                        className="rb-custom-title-indicator"
                        role="img"
                        aria-label="Custom title"
                        title="Custom title"
                      >
                        <span aria-hidden="true">•</span>
                      </span>
                    ) : null}
                    <div className="rb-section-title-controls">
                      <button
                        ref={(element) => {
                          if (element) {
                            renameButtonRefs.current.set(group.id, element);
                          } else {
                            renameButtonRefs.current.delete(group.id);
                          }
                        }}
                        type="button"
                        className="rb-section-title-rename"
                        aria-label={`Rename section “${group.title}”`}
                        title="Rename section"
                        disabled={saving || restoringGroupId !== null}
                        onClick={() => beginRename(group)}
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                      {group.hasCustomTitle ? (
                        <button
                          type="button"
                          className="rb-section-title-restore"
                          aria-label={`Restore automatic title for section “${group.title}”`}
                          title="Restore automatic title"
                          disabled={saving || restoringGroupId !== null}
                          onClick={() => void restoreAutomaticTitle(group)}
                        >
                          <span aria-hidden="true">↺</span>
                        </button>
                      ) : null}
                    </div>
                    {group.children.length > 0 ? (
                      <button
                        type="button"
                        className="rb-outline-group-toggle"
                        aria-label={`${expanded ? "Collapse" : "Expand"} headings for ${group.title}`}
                        aria-expanded={expanded}
                        onClick={() => toggleGroup(group, expanded)}
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    ) : null}
                  </div>
                )}
                {expanded && group.children.length > 0 ? (
                  <HeadingItems
                    items={group.children}
                    activeHeadingId={active ? activeHeadingId : null}
                    onSelect={(item) => onSelectHeading(group, item)}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
