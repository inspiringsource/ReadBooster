import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { GuidedReadingMode } from "../../shared/types";
import {
  applyReadingBlockMetadata,
  discoverReadingBlocks,
  nearestReadingBlock,
  setReadingBlockStates,
  type ReadingBlockEntry,
} from "./readingBlocks";

interface GuidedReadingOptions {
  readonly mode: GuidedReadingMode;
  readonly scrollAreaRef: RefObject<HTMLElement | null>;
  readonly revision: string;
  readonly suspended: boolean;
  readonly onNavigate: (message: string) => void;
}

export interface GuidedReadingController {
  readonly enabled: boolean;
  readonly activeId: string | null;
  readonly activeIndex: number;
  readonly blockCount: number;
  readonly canGoPrevious: boolean;
  readonly canGoNext: boolean;
  readonly navigate: (direction: -1 | 1) => void;
  readonly centerActive: () => void;
}

function requestFrame(callback: FrameRequestCallback): number {
  return typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 0);
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollEntryIntoReadingZone(
  scrollArea: HTMLElement,
  entry: ReadingBlockEntry,
  focus: boolean,
): void {
  const rootRect = scrollArea.getBoundingClientRect();
  const blockRect = entry.element.getBoundingClientRect();
  const targetTop =
    scrollArea.scrollTop +
    blockRect.top -
    rootRect.top -
    rootRect.height * 0.42 +
    Math.min(blockRect.height / 2, rootRect.height * 0.18);
  scrollArea.scrollTo({
    top: Math.max(0, targetTop),
    behavior: reducedMotion() ? "auto" : "smooth",
  });
  if (focus) entry.element.focus({ preventScroll: true });
}

export function useGuidedReading({
  mode,
  scrollAreaRef,
  revision,
  suspended,
  onNavigate,
}: GuidedReadingOptions): GuidedReadingController {
  const enabled = mode !== "off";
  const entriesRef = useRef<ReadingBlockEntry[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState({
    activeId: null as string | null,
    activeIndex: -1,
    blockCount: 0,
  });

  const commitActive = useCallback((entry: ReadingBlockEntry | null): void => {
    const nextId = entry?.id ?? null;
    const nextIndex = entry ? entriesRef.current.indexOf(entry) : -1;
    activeIdRef.current = nextId;
    setReadingBlockStates(entriesRef.current, nextId);
    setSnapshot((current) =>
      current.activeId === nextId &&
      current.activeIndex === nextIndex &&
      current.blockCount === entriesRef.current.length
        ? current
        : { activeId: nextId, activeIndex: nextIndex, blockCount: entriesRef.current.length },
    );
  }, []);

  const navigate = useCallback(
    (direction: -1 | 1): void => {
      const entries = entriesRef.current;
      const scrollArea = scrollAreaRef.current;
      if (!enabled || suspended || !scrollArea || entries.length === 0) return;
      const currentIndex = Math.max(
        0,
        entries.findIndex((entry) => entry.id === activeIdRef.current),
      );
      const nextIndex = Math.min(entries.length - 1, Math.max(0, currentIndex + direction));
      const next = entries[nextIndex];
      commitActive(next);
      scrollEntryIntoReadingZone(scrollArea, next, true);
      onNavigate(
        `Moved to passage ${nextIndex + 1} of ${entries.length}${next.kind === "paragraph" ? "" : `, ${next.kind}`}.`,
      );
    },
    [commitActive, enabled, onNavigate, scrollAreaRef, suspended],
  );

  const centerActive = useCallback((): void => {
    const scrollArea = scrollAreaRef.current;
    const active = entriesRef.current.find((entry) => entry.id === activeIdRef.current);
    if (enabled && !suspended && scrollArea && active) {
      scrollEntryIntoReadingZone(scrollArea, active, true);
    }
  }, [enabled, scrollAreaRef, suspended]);

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!enabled || suspended || !scrollArea) {
      entriesRef.current = [];
      activeIdRef.current = null;
      setSnapshot((current) =>
        current.activeId === null && current.activeIndex === -1 && current.blockCount === 0
          ? current
          : { activeId: null, activeIndex: -1, blockCount: 0 },
      );
      return;
    }

    let frame = 0;
    let metadataCleanup: () => void = () => undefined;
    let resizeObserver: ResizeObserver | null = null;
    const hasFullscreenTable = (): boolean =>
      Boolean(scrollArea.querySelector('[data-rb-table-fullscreen="true"]'));
    const scheduleUpdate = (): void => {
      if (hasFullscreenTable()) return;
      cancelFrame(frame);
      frame = requestFrame(() => {
        frame = 0;
        const nearest = nearestReadingBlock(entriesRef.current, scrollArea, activeIdRef.current);
        commitActive(nearest);
      });
    };
    const scan = (): void => {
      metadataCleanup();
      resizeObserver?.disconnect();
      const entries = discoverReadingBlocks(scrollArea);
      entriesRef.current = entries;
      metadataCleanup = applyReadingBlockMetadata(entries);
      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(scrollArea);
        for (const content of scrollArea.querySelectorAll<HTMLElement>(".rb-content")) {
          resizeObserver.observe(content);
        }
      }
      const retained = entries.find((entry) => entry.id === activeIdRef.current);
      commitActive(retained ?? nearestReadingBlock(entries, scrollArea, null));
    };
    const handlePointer = (event: PointerEvent): void => {
      if (event.button !== 0 || hasFullscreenTable()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target ||
        target.closest("button, input, textarea, select, summary, a, [contenteditable]")
      ) {
        return;
      }
      const block = target.closest<HTMLElement>("[data-rb-reading-block-id]");
      if (!block || !scrollArea.contains(block) || !window.getSelection()?.isCollapsed) return;
      commitActive(entriesRef.current.find((entry) => entry.element === block) ?? null);
    };
    const handleImageLoad = (event: Event): void => {
      if (event.target instanceof HTMLImageElement) scheduleUpdate();
    };

    frame = requestFrame(scan);
    scrollArea.addEventListener("scroll", scheduleUpdate, { passive: true });
    scrollArea.addEventListener("pointerdown", handlePointer);
    scrollArea.addEventListener("load", handleImageLoad, true);
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    return () => {
      cancelFrame(frame);
      resizeObserver?.disconnect();
      scrollArea.removeEventListener("scroll", scheduleUpdate);
      scrollArea.removeEventListener("pointerdown", handlePointer);
      scrollArea.removeEventListener("load", handleImageLoad, true);
      window.removeEventListener("resize", scheduleUpdate);
      metadataCleanup();
      entriesRef.current = [];
    };
  }, [commitActive, enabled, revision, scrollAreaRef, suspended]);

  return {
    enabled,
    activeId: snapshot.activeId,
    activeIndex: snapshot.activeIndex,
    blockCount: snapshot.blockCount,
    canGoPrevious: snapshot.activeIndex > 0,
    canGoNext: snapshot.activeIndex >= 0 && snapshot.activeIndex < snapshot.blockCount - 1,
    navigate,
    centerActive,
  };
}
