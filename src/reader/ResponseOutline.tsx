import { useEffect, useMemo, useState, type RefObject } from "react";

import type { DocumentContentBlock } from "../shared/types";
import { buildOutline, flattenOutline, type OutlineItem } from "./outline";

interface ResponseOutlineProps {
  response: DocumentContentBlock;
  scrollAreaRef: RefObject<HTMLElement | null>;
  open: boolean;
}

function OutlineItems({
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
            <OutlineItems
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

export function ResponseOutline({ response, scrollAreaRef, open }: ResponseOutlineProps) {
  const outline = useMemo(() => buildOutline([response]), [response]);
  const flatOutline = useMemo(() => flattenOutline(outline), [outline]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(
    flatOutline[0]?.targetHeadingId ?? null,
  );

  useEffect(() => {
    if (!open || flatOutline.length === 0) {
      return;
    }

    const scrollArea = scrollAreaRef.current;
    const content = scrollArea?.querySelector<HTMLElement>(".rb-content");
    if (!scrollArea || !content) {
      return;
    }
    const headingIds = new Set(flatOutline.map((item) => item.targetHeadingId));
    const headings = Array.from(
      content.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
    ).filter((heading) => headingIds.has(heading.id));

    const updateFromScroll = (): void => {
      const rootTop = scrollArea.getBoundingClientRect().top;
      const passed = headings.filter(
        (heading) => heading.getBoundingClientRect().top <= rootTop + 24,
      );
      setActiveHeadingId((passed.at(-1) ?? headings[0])?.id ?? null);
    };
    scrollArea.addEventListener("scroll", updateFromScroll, { passive: true });

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting && entry.target instanceof HTMLElement)
            .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
          const heading = visible[0]?.target;
          if (heading instanceof HTMLElement) {
            setActiveHeadingId(heading.id);
          } else {
            updateFromScroll();
          }
        },
        { root: scrollArea, rootMargin: "-12px 0px -65% 0px", threshold: [0, 1] },
      );
      headings.forEach((heading) => observer?.observe(heading));
    }

    return () => {
      scrollArea.removeEventListener("scroll", updateFromScroll);
      observer?.disconnect();
    };
  }, [flatOutline, open, response.id, scrollAreaRef]);

  const selectHeading = (item: OutlineItem): void => {
    const scrollArea = scrollAreaRef.current;
    const content = scrollArea?.querySelector<HTMLElement>(".rb-content");
    const heading = content
      ? Array.from(content.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).find(
          (candidate) => candidate.id === item.targetHeadingId,
        )
      : undefined;
    if (!scrollArea || !heading) {
      return;
    }

    const top =
      scrollArea.scrollTop +
      heading.getBoundingClientRect().top -
      scrollArea.getBoundingClientRect().top -
      16;
    if (typeof scrollArea.scrollTo === "function") {
      scrollArea.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      heading.scrollIntoView({ block: "start" });
    }
    setActiveHeadingId(item.targetHeadingId);
  };

  return (
    <aside
      id="rb-response-outline"
      className="rb-outline rb-print-hidden"
      aria-label="Current response outline"
      hidden={!open}
    >
      <h2>On this response</h2>
      {outline.length > 0 ? (
        <nav aria-label="Headings in the current assistant response">
          <OutlineItems
            items={outline}
            activeHeadingId={activeHeadingId}
            onSelect={selectHeading}
          />
        </nav>
      ) : (
        <p className="rb-outline-empty">No headings in this response.</p>
      )}
    </aside>
  );
}
