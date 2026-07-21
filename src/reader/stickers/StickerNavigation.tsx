import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { Sticker } from "../../shared/stickers";
import {
  resolveStickerNavigation,
  type StickerNavigationEntry,
  type StickerNavigationState,
} from "./stickerNavigationModel";

const EMPTY_NAVIGATION: StickerNavigationState = {
  ordered: [],
  aboveCount: 0,
  belowCount: 0,
  nearestAbove: null,
  nearestBelow: null,
};
const HIGHLIGHT_DURATION_MS = 1600;

interface StickerNavigationProps {
  scrollAreaRef: RefObject<HTMLElement | null>;
  stickers: readonly Sticker[];
  hidden?: boolean;
}

function sameNavigationState(left: StickerNavigationState, right: StickerNavigationState): boolean {
  return (
    left.aboveCount === right.aboveCount &&
    left.belowCount === right.belowCount &&
    left.nearestAbove?.stickerId === right.nearestAbove?.stickerId &&
    left.nearestBelow?.stickerId === right.nearestBelow?.stickerId
  );
}

function findStickerElement(scrollArea: HTMLElement, stickerId: string): HTMLElement | null {
  return (
    Array.from(scrollArea.querySelectorAll<HTMLElement>("[data-rb-sticker-id]")).find(
      (element) => element.dataset.rbStickerId === stickerId,
    ) ?? null
  );
}

function sectionTitleFor(element: HTMLElement): string {
  const section = element.closest<HTMLElement>("[data-rb-section-id], .rb-focus-section");
  const labelledBy = section?.getAttribute("aria-labelledby");
  if (labelledBy) {
    const heading = Array.from(section?.querySelectorAll<HTMLElement>("[id]") ?? []).find(
      (candidate) => candidate.id === labelledBy,
    );
    if (heading?.textContent?.trim()) {
      return heading.textContent.trim();
    }
  }
  return (
    section?.getAttribute("aria-label")?.trim() ||
    section?.querySelector<HTMLElement>(".rb-document-section-header h2")?.textContent?.trim() ||
    "current section"
  );
}

export function StickerNavigation({
  scrollAreaRef,
  stickers,
  hidden = false,
}: StickerNavigationProps) {
  const [navigation, setNavigation] = useState<StickerNavigationState>(EMPTY_NAVIGATION);
  const [announcement, setAnnouncement] = useState("");
  const highlightTimerRef = useRef<number | null>(null);
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  const stickerMetadata = useMemo(
    () => new Map(stickers.map((sticker) => [sticker.id, sticker])),
    [stickers],
  );

  const measure = useCallback((): void => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      setNavigation((current) =>
        sameNavigationState(current, EMPTY_NAVIGATION) ? current : EMPTY_NAVIGATION,
      );
      return;
    }
    const sectionElements = Array.from(
      scrollArea.querySelectorAll<HTMLElement>("[data-rb-section-id], .rb-focus-section"),
    );
    const sectionOrder = new Map(sectionElements.map((section, index) => [section, index]));
    const entries = Array.from(
      scrollArea.querySelectorAll<HTMLElement>("[data-rb-sticker-id]"),
    ).flatMap((element): StickerNavigationEntry[] => {
      const stickerId = element.dataset.rbStickerId;
      const section = element.closest<HTMLElement>("[data-rb-section-id], .rb-focus-section");
      const sticker = stickerId ? stickerMetadata.get(stickerId) : undefined;
      if (!stickerId || !section || !sticker) {
        return [];
      }
      const rect = element.getBoundingClientRect();
      return [
        {
          stickerId,
          sectionId: section.dataset.rbSectionId ?? sticker.sectionKey,
          sectionOrder: sectionOrder.get(section) ?? Number.MAX_SAFE_INTEGER,
          positionOrder: Number.parseFloat(element.dataset.rbStickerYRatio ?? "0") || 0,
          createdAt: sticker.createdAt,
          top: rect.top,
          bottom: rect.bottom,
        },
      ];
    });
    const viewportRect = scrollArea.getBoundingClientRect();
    const next = resolveStickerNavigation(entries, {
      top: viewportRect.top,
      bottom: viewportRect.bottom,
    });
    setNavigation((current) => (sameNavigationState(current, next) ? current : next));
  }, [scrollAreaRef, stickerMetadata]);

  const revision = stickers
    .map(
      (sticker) =>
        `${sticker.id}:${sticker.sectionKey}:${sticker.position.yRatio}:${sticker.isCollapsed}:${sticker.updatedAt}`,
    )
    .join("|");

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }
    let frame = 0;
    const scheduleMeasure = (): void => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(scheduleMeasure) : null;
    resizeObserver?.observe(scrollArea);
    scrollArea
      .querySelectorAll<HTMLElement>(
        "[data-rb-sticker-id], [data-rb-section-id], .rb-focus-section",
      )
      .forEach((element) => resizeObserver?.observe(element));
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(scrollArea, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-rb-sticker-y-ratio"],
    });
    scrollArea.addEventListener("scroll", scheduleMeasure, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();
    return () => {
      scrollArea.removeEventListener("scroll", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [measure, revision, scrollAreaRef]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightedElementRef.current?.removeAttribute("data-rb-sticker-highlighted");
    },
    [],
  );

  const navigate = (direction: "above" | "below"): void => {
    const scrollArea = scrollAreaRef.current;
    const destination = direction === "above" ? navigation.nearestAbove : navigation.nearestBelow;
    if (!scrollArea || !destination) {
      return;
    }
    const element = findStickerElement(scrollArea, destination.stickerId);
    if (!element) {
      measure();
      return;
    }
    const scrollRect = scrollArea.getBoundingClientRect();
    const targetRect = element.getBoundingClientRect();
    const targetTop =
      scrollArea.scrollTop +
      targetRect.top -
      scrollRect.top -
      Math.max(0, (scrollArea.clientHeight - targetRect.height) / 2);
    const maximumTop = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollArea.scrollTo({
      top: Math.min(maximumTop, Math.max(0, targetTop)),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightedElementRef.current?.removeAttribute("data-rb-sticker-highlighted");
    highlightedElementRef.current = element;
    element.dataset.rbStickerHighlighted = "true";
    highlightTimerRef.current = window.setTimeout(() => {
      element.removeAttribute("data-rb-sticker-highlighted");
      if (highlightedElementRef.current === element) {
        highlightedElementRef.current = null;
      }
      highlightTimerRef.current = null;
    }, HIGHLIGHT_DURATION_MS);
    setAnnouncement(`Moved to Sticker in section “${sectionTitleFor(element)}”.`);
  };

  if (hidden || (navigation.aboveCount === 0 && navigation.belowCount === 0)) {
    return (
      <span className="rb-visually-hidden" aria-live="polite">
        {announcement}
      </span>
    );
  }

  return (
    <nav className="rb-sticker-navigation rb-print-hidden" aria-label="Sticker navigation">
      {navigation.aboveCount > 0 ? (
        <button
          type="button"
          data-rb-sticker-navigation="above"
          aria-label={`Go to nearest Sticker above. ${navigation.aboveCount} ${navigation.aboveCount === 1 ? "Sticker" : "Stickers"} above.`}
          title={`${navigation.aboveCount} ${navigation.aboveCount === 1 ? "Sticker" : "Stickers"} above`}
          onClick={() => navigate("above")}
        >
          <span aria-hidden="true">↑</span>
          <span>{navigation.aboveCount}</span>
        </button>
      ) : null}
      {navigation.belowCount > 0 ? (
        <button
          type="button"
          data-rb-sticker-navigation="below"
          aria-label={`Go to nearest Sticker below. ${navigation.belowCount} ${navigation.belowCount === 1 ? "Sticker" : "Stickers"} below.`}
          title={`${navigation.belowCount} ${navigation.belowCount === 1 ? "Sticker" : "Stickers"} below`}
          onClick={() => navigate("below")}
        >
          <span aria-hidden="true">↓</span>
          <span>{navigation.belowCount}</span>
        </button>
      ) : null}
      <span className="rb-visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </nav>
  );
}
