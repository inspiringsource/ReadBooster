import { useState } from "react";

import type { OutlineItem } from "./outline";
import type { ConversationOutlineGroup } from "./presentation";

interface ConversationOutlineProps {
  groups: readonly ConversationOutlineGroup[];
  activeSectionId: string;
  activeHeadingId: string | null;
  open: boolean;
  onSelectGroup: (group: ConversationOutlineGroup) => void;
  onSelectHeading: (group: ConversationOutlineGroup, item: OutlineItem) => void;
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
}: ConversationOutlineProps) {
  const [expandedOverrides, setExpandedOverrides] = useState(() => new Map<string, boolean>());

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
      <nav aria-label="Conversation sections">
        <ol className="rb-outline-groups">
          {groups.map((group) => {
            const active = group.targetSectionId === activeSectionId;
            const expanded = expandedOverrides.get(group.id) ?? active;
            return (
              <li key={group.id} className="rb-outline-group">
                <div className="rb-outline-group-row">
                  <button
                    type="button"
                    className="rb-outline-group-link"
                    aria-current={active ? "location" : undefined}
                    onClick={() => onSelectGroup(group)}
                  >
                    {group.title}
                  </button>
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
