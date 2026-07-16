import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import packageJson from "../../package.json";
import { conversationDocumentsMatch, mergeConversationDocuments } from "../shared/conversation";
import { preferencesForPreset } from "../shared/preferences";
import {
  removeSectionTitleOverride,
  saveReaderPreferences,
  saveSectionTitleOverride,
} from "../shared/storage";
import {
  normalizeCustomSectionTitle,
  sectionTitleOverrideIdentity,
} from "../shared/sectionTitleOverrides";
import type {
  AppearanceMode,
  CodeAppearance,
  ConversationDocument,
  DocumentOpenAt,
  ReaderPreferences,
  ReaderPreset,
  RefreshConversation,
  SpacingLevel,
  TextSize,
} from "../shared/types";
import { assistantBlocks } from "../shared/types";
import type { TableDisplayState, TableFullscreenCoordinator } from "./blockControls";
import { ContinuousDocumentView } from "./ContinuousDocumentView";
import { ConversationOutline } from "./ConversationOutline";
import { FeedbackModal } from "./FeedbackModal";
import { FocusResponseView } from "./FocusResponseView";
import type { OutlineItem } from "./outline";
import {
  conversationCopyText,
  applySectionTitleOverrides,
  deriveConversationOutline,
  deriveConversationSections,
  type ConversationOutlineGroup,
  type ReaderMode,
} from "./presentation";

interface ReaderViewProps {
  conversation: ConversationDocument;
  initialResponseId?: string;
  initialPreferences: ReaderPreferences;
  initialSectionTitleOverrides: ReadonlyMap<string, string>;
  refreshConversation?: RefreshConversation;
  onClose: () => void;
}

type HeaderPanel = "actions" | "reading-settings";
type RefreshStatus = "idle" | "checking" | "success" | "unchanged" | "failed";

interface PendingRefreshAnchor {
  responseBlockId: string;
  headingId: string | null;
  viewportOffset: number;
}

const READER_VERSION = packageJson.version;

const TEXT_SIZE_VALUES: Record<TextSize, string> = {
  small: "17px",
  medium: "19px",
  large: "21px",
  "x-large": "24px",
};

const LINE_HEIGHT_VALUES: Record<SpacingLevel, string> = {
  compact: "1.55",
  comfortable: "1.72",
  roomy: "1.9",
};

const SOURCE_LABELS: Record<ConversationDocument["source"], string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Copy was not available");
  }
}

export function ReaderView({
  conversation,
  initialResponseId,
  initialPreferences,
  initialSectionTitleOverrides,
  refreshConversation,
  onClose,
}: ReaderViewProps) {
  const [accumulatedConversation, setAccumulatedConversation] = useState(conversation);
  const accumulatedConversationRef = useRef(conversation);
  const [sectionTitleOverrides, setSectionTitleOverrides] = useState(
    () => new Map(initialSectionTitleOverrides),
  );
  const automaticSections = useMemo(
    () => deriveConversationSections(accumulatedConversation),
    [accumulatedConversation],
  );
  const sections = useMemo(
    () =>
      applySectionTitleOverrides(accumulatedConversation, automaticSections, sectionTitleOverrides),
    [accumulatedConversation, automaticSections, sectionTitleOverrides],
  );
  const outlineGroups = useMemo(() => deriveConversationOutline(sections), [sections]);
  const responses = useMemo(() => sections.map((section) => section.response), [sections]);
  const requestedInitialIndex = responses.findIndex(
    (response) => response.id === initialResponseId,
  );
  const initialResponseIndex =
    requestedInitialIndex >= 0 ? requestedInitialIndex : responses.length - 1;
  const initialDocumentSection =
    initialPreferences.documentOpenAt === "beginning" ? sections[0] : sections.at(-1);
  const [mode, setMode] = useState<ReaderMode>("document");
  const [preferences, setPreferences] = useState(initialPreferences);
  const [currentResponseIndex, setCurrentResponseIndex] = useState(initialResponseIndex);
  const [activeSectionId, setActiveSectionId] = useState(initialDocumentSection?.id ?? "");
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [sectionTitleStatus, setSectionTitleStatus] = useState("");
  const [headerPanel, setHeaderPanel] = useState<HeaderPanel | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches,
  );
  const [outlineOpen, setOutlineOpen] = useState(() => !isNarrow);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const outlineToggleRef = useRef<HTMLButtonElement>(null);
  const readingSettingsTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const feedbackTriggerRef = useRef<HTMLButtonElement>(null);
  const headerPanelRef = useRef<HTMLDivElement>(null);
  const documentScrollTopRef = useRef(0);
  const initialDocumentPositionAppliedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const automaticScanStartedRef = useRef(false);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const refreshStatusTimerRef = useRef<number | undefined>(undefined);
  const sectionTitleStatusTimerRef = useRef<number | undefined>(undefined);
  const readerMountedRef = useRef(true);
  const pendingRefreshAnchorRef = useRef<PendingRefreshAnchor | null>(null);
  const modeRef = useRef(mode);
  const currentResponseIdRef = useRef<string | undefined>(undefined);
  const [tableSessionStates] = useState(() => new Map<string, TableDisplayState>());
  const [fullscreenCoordinator] = useState<TableFullscreenCoordinator>(() => ({
    activeClose: null,
  }));
  const response = responses[currentResponseIndex];
  const documentTitle = accumulatedConversation.title?.trim() || "Conversation document.";

  useLayoutEffect(() => {
    modeRef.current = mode;
    currentResponseIdRef.current = response?.id;
  }, [mode, response?.id]);

  useEffect(
    () => () => {
      readerMountedRef.current = false;
      scanAbortControllerRef.current?.abort();
      scanAbortControllerRef.current = null;
      window.clearTimeout(refreshStatusTimerRef.current);
      window.clearTimeout(sectionTitleStatusTimerRef.current);
      refreshInFlightRef.current = false;
      pendingRefreshAnchorRef.current = null;
    },
    [],
  );

  const closeHeaderPanel = useCallback(
    (restoreFocus = true): void => {
      const trigger =
        headerPanel === "reading-settings"
          ? readingSettingsTriggerRef.current
          : actionsTriggerRef.current;
      setHeaderPanel(null);
      setAboutOpen(false);
      if (restoreFocus) {
        queueMicrotask(() => trigger?.focus());
      }
    },
    [headerPanel],
  );

  const toggleHeaderPanel = (panel: HeaderPanel): void => {
    if (headerPanel === panel) {
      closeHeaderPanel();
      return;
    }
    setAboutOpen(false);
    setHeaderPanel(panel);
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia("(max-width: 900px)");
    const handleChange = (event: MediaQueryListEvent): void => {
      setIsNarrow(event.matches);
      setOutlineOpen(!event.matches);
    };
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  useLayoutEffect(() => {
    if (!headerPanel) {
      return;
    }
    headerPanelRef.current?.querySelector<HTMLElement>("select, button")?.focus();
  }, [headerPanel]);

  useEffect(() => {
    if (!headerPanel) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent): void => {
      if (feedbackOpen) {
        return;
      }
      if (!dialogRef.current?.isConnected) {
        return;
      }
      const path = event.composedPath();
      if (
        path.includes(headerPanelRef.current as EventTarget) ||
        path.includes(readingSettingsTriggerRef.current as EventTarget) ||
        path.includes(actionsTriggerRef.current as EventTarget)
      ) {
        return;
      }
      closeHeaderPanel();
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [closeHeaderPanel, feedbackOpen, headerPanel]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (feedbackOpen) {
        return;
      }
      const fullscreenTable = dialogRef.current?.querySelector('[data-rb-table-fullscreen="true"]');
      if (fullscreenTable) {
        return;
      }

      if (event.key === "Escape") {
        const sectionTitleEditorInPath = event
          .composedPath()
          .some(
            (target) =>
              target instanceof Element && target.matches("[data-rb-section-title-editor]"),
          );
        if (sectionTitleEditorInPath) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (headerPanel) {
          closeHeaderPanel();
          return;
        }
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        const target = event.target;
        const isFormControl =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement;
        const isTableViewport =
          target instanceof Element && Boolean(target.closest(".rb-table-scroll"));
        const scrollArea = scrollAreaRef.current;
        if (!isFormControl && !isTableViewport && scrollArea) {
          const pageDistance = Math.max(120, scrollArea.clientHeight * 0.85);
          const scrollCommands: Partial<Record<string, () => void>> = {
            PageDown: () => scrollArea.scrollBy({ top: pageDistance }),
            PageUp: () => scrollArea.scrollBy({ top: -pageDistance }),
            Home: () => scrollArea.scrollTo({ top: 0 }),
            End: () => scrollArea.scrollTo({ top: scrollArea.scrollHeight }),
            ArrowDown: () => scrollArea.scrollBy({ top: 48 }),
            ArrowUp: () => scrollArea.scrollBy({ top: -48 }),
          };
          const scroll = scrollCommands[event.key];
          if (scroll) {
            event.preventDefault();
            scroll();
          }
        }
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), summary, a[href], [tabindex]:not([tabindex="-1"]):not([hidden])',
        ),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const rootNode = dialogRef.current.getRootNode();
      const activeElement =
        rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeHeaderPanel, feedbackOpen, headerPanel, onClose]);

  useLayoutEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }
    if (mode === "document") {
      scrollArea.scrollTop = documentScrollTopRef.current;
    } else {
      scrollArea.scrollTop = 0;
    }
  }, [mode]);

  useLayoutEffect(() => {
    if (initialDocumentPositionAppliedRef.current || mode !== "document") {
      return;
    }
    const scrollArea = scrollAreaRef.current;
    const targetId = initialDocumentSection?.id;
    if (!scrollArea || !targetId) {
      return;
    }
    const target = Array.from(
      scrollArea.querySelectorAll<HTMLElement>("[data-rb-section-id]"),
    ).find((section) => section.id === targetId);
    if (!target) {
      return;
    }
    const top = Math.max(0, target.offsetTop - 16);
    scrollArea.scrollTop = top;
    documentScrollTopRef.current = top;
    setActiveSectionId(targetId);
    setActiveHeadingId(null);
    initialDocumentPositionAppliedRef.current = true;
  }, [initialDocumentSection?.id, mode]);

  useLayoutEffect(() => {
    const pending = pendingRefreshAnchorRef.current;
    const scrollArea = scrollAreaRef.current;
    if (!pending || mode !== "document" || !scrollArea) {
      return;
    }
    pendingRefreshAnchorRef.current = null;
    const section = sections.find(
      (candidate) => candidate.responseBlockId === pending.responseBlockId,
    );
    if (!section) {
      return;
    }
    const targetId = pending.headingId ?? section.id;
    const target = Array.from(scrollArea.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => element.id === targetId,
    );
    if (target) {
      const currentOffset =
        target.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top;
      scrollArea.scrollTop += currentOffset - pending.viewportOffset;
      documentScrollTopRef.current = scrollArea.scrollTop;
    }
    setActiveSectionId(section.id);
    setActiveHeadingId(pending.headingId && target ? pending.headingId : null);
  }, [mode, sections]);

  const readerStyle = useMemo(
    () =>
      ({
        "--rb-font-size": TEXT_SIZE_VALUES[preferences.textSize],
        "--rb-line-height": LINE_HEIGHT_VALUES[preferences.spacing],
      }) as React.CSSProperties,
    [preferences],
  );

  const updatePreferences = (next: ReaderPreferences): void => {
    setPreferences(next);
    void saveReaderPreferences(next).catch(() => undefined);
  };

  const updatePreset = (preset: ReaderPreset): void => {
    if (preset === "custom") {
      updatePreferences({ ...preferences, preset });
      return;
    }
    updatePreferences(
      preferencesForPreset(preset, preferences.appearance, {
        codeAppearance: preferences.codeAppearance,
        documentOpenAt: preferences.documentOpenAt,
      }),
    );
  };

  const handleActiveDocumentChange = useCallback(
    (sectionId: string, headingId: string | null): void => {
      setActiveSectionId(sectionId);
      setActiveHeadingId(headingId);
    },
    [],
  );

  const announceSectionTitleStatus = useCallback((message: string): void => {
    if (!readerMountedRef.current) {
      return;
    }
    window.clearTimeout(sectionTitleStatusTimerRef.current);
    setSectionTitleStatus(message);
    sectionTitleStatusTimerRef.current = window.setTimeout(() => {
      if (readerMountedRef.current) {
        setSectionTitleStatus("");
      }
    }, 5000);
  }, []);

  const renameSection = useCallback(
    async (group: ConversationOutlineGroup, value: string): Promise<void> => {
      const title = normalizeCustomSectionTitle(value);
      const section = sections.find(
        (candidate) => candidate.responseBlockId === group.responseBlockId,
      );
      if (!title || !section) {
        return;
      }
      const currentConversation = accumulatedConversationRef.current;
      const identity = sectionTitleOverrideIdentity(currentConversation, section.response);
      setSectionTitleOverrides((current) => {
        const next = new Map(current);
        next.set(identity.lookupKey, title);
        return next;
      });

      const result = await saveSectionTitleOverride(currentConversation, section.response, title);
      announceSectionTitleStatus(
        result === "saved"
          ? "Section title renamed."
          : "Title renamed for this session, but it could not be saved locally.",
      );
    },
    [announceSectionTitleStatus, sections],
  );

  const restoreAutomaticSectionTitle = useCallback(
    async (group: ConversationOutlineGroup): Promise<void> => {
      const section = sections.find(
        (candidate) => candidate.responseBlockId === group.responseBlockId,
      );
      if (!section) {
        return;
      }
      const currentConversation = accumulatedConversationRef.current;
      const identity = sectionTitleOverrideIdentity(currentConversation, section.response);
      setSectionTitleOverrides((current) => {
        const next = new Map(current);
        next.delete(identity.lookupKey);
        return next;
      });

      const result = await removeSectionTitleOverride(currentConversation, section.response);
      announceSectionTitleStatus(
        result === "removed" || result === "not-persistable"
          ? "Automatic section title restored."
          : "Automatic title restored for this session, but the saved override could not be removed.",
      );
    },
    [announceSectionTitleStatus, sections],
  );

  const changeMode = (nextMode: ReaderMode): void => {
    if (nextMode === mode) {
      return;
    }
    fullscreenCoordinator.activeClose?.();
    setCopyStatus("idle");
    if (nextMode === "focus") {
      documentScrollTopRef.current = scrollAreaRef.current?.scrollTop ?? 0;
      const activeIndex = sections.findIndex((section) => section.id === activeSectionId);
      if (activeIndex >= 0) {
        setCurrentResponseIndex(activeIndex);
      }
    }
    setMode(nextMode);
  };

  const handleCopy = async (): Promise<void> => {
    const value = mode === "document" ? conversationCopyText(sections) : response.text;
    try {
      await copyText(value);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const openFeedback = (): void => {
    setAboutOpen(false);
    setFeedbackOpen(true);
  };

  const closeFeedback = useCallback((): void => {
    setFeedbackOpen(false);
    queueMicrotask(() => feedbackTriggerRef.current?.focus());
  }, []);

  const setTransientRefreshStatus = useCallback(
    (status: Exclude<RefreshStatus, "checking">, message: string): void => {
      if (!readerMountedRef.current) {
        return;
      }
      window.clearTimeout(refreshStatusTimerRef.current);
      setRefreshStatus(status);
      setRefreshMessage(message);
      refreshStatusTimerRef.current = window.setTimeout(() => {
        if (readerMountedRef.current) {
          setRefreshStatus("idle");
          setRefreshMessage("");
        }
      }, 5000);
    },
    [],
  );

  const handleRefreshConversation = useCallback(async (): Promise<void> => {
    if (!refreshConversation || refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    const abortController = new AbortController();
    scanAbortControllerRef.current = abortController;
    window.clearTimeout(refreshStatusTimerRef.current);
    setRefreshStatus("checking");
    setRefreshMessage("Scanning conversation…");

    const existing = accumulatedConversationRef.current;
    const activeSection = sections.find((section) => section.id === activeSectionId);
    const scrollArea = scrollAreaRef.current;
    const anchorTargetId = activeHeadingId ?? activeSection?.id;
    const anchorTarget = anchorTargetId
      ? Array.from(scrollArea?.querySelectorAll<HTMLElement>("[id]") ?? []).find(
          (element) => element.id === anchorTargetId,
        )
      : null;
    const viewportOffset =
      anchorTarget && scrollArea
        ? anchorTarget.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top
        : 0;

    try {
      const result = await refreshConversation({
        signal: abortController.signal,
        onProgress: (progress) => {
          if (!readerMountedRef.current || abortController.signal.aborted) {
            return;
          }
          setRefreshMessage(
            `Scanning conversation… ${progress.accumulatedAssistantCount} response${progress.accumulatedAssistantCount === 1 ? "" : "s"} found`,
          );
        },
      });
      if (!readerMountedRef.current) {
        return;
      }
      const incoming = result.document;
      if (result.terminationReason === "identity-mismatch") {
        setTransientRefreshStatus("failed", "Conversation changed before the scan completed");
        return;
      }
      if (!incoming || !conversationDocumentsMatch(existing, incoming)) {
        setTransientRefreshStatus("failed", "Full conversation scan could not be completed");
        return;
      }
      const merged = mergeConversationDocuments(existing, incoming);
      const previousResponseCount = assistantBlocks(existing).length;
      const nextResponses = assistantBlocks(merged);
      const addedResponseCount = nextResponses.length - previousResponseCount;

      if (merged !== existing) {
        if (activeSection && anchorTarget) {
          pendingRefreshAnchorRef.current = {
            responseBlockId: activeSection.responseBlockId,
            headingId: activeHeadingId,
            viewportOffset,
          };
        }
        const focusedResponseId = currentResponseIdRef.current;
        if (modeRef.current === "focus" && focusedResponseId) {
          const nextIndex = nextResponses.findIndex(
            (candidate) => candidate.id === focusedResponseId,
          );
          if (nextIndex >= 0) {
            setCurrentResponseIndex(nextIndex);
          }
        }
        accumulatedConversationRef.current = merged;
        setAccumulatedConversation(merged);
      }

      if (!result.scanPerformed || !result.completed) {
        setTransientRefreshStatus(
          addedResponseCount > 0 ? "success" : "failed",
          addedResponseCount > 0
            ? `Conversation updated — ${nextResponses.length} responses available; full scan could not be completed`
            : "Full conversation scan could not be completed",
        );
      } else if (addedResponseCount > 0) {
        setTransientRefreshStatus(
          "success",
          `${addedResponseCount} additional response${addedResponseCount === 1 ? "" : "s"} found`,
        );
      } else if (merged !== existing) {
        setTransientRefreshStatus(
          "success",
          `Conversation updated — ${nextResponses.length} responses available`,
        );
      } else {
        setTransientRefreshStatus(
          "unchanged",
          "No additional responses found after scanning the conversation",
        );
      }
    } catch {
      if (!abortController.signal.aborted) {
        setTransientRefreshStatus("failed", "Full conversation scan could not be completed");
      }
    } finally {
      refreshInFlightRef.current = false;
      if (scanAbortControllerRef.current === abortController) {
        scanAbortControllerRef.current = null;
      }
    }
  }, [activeHeadingId, activeSectionId, refreshConversation, sections, setTransientRefreshStatus]);

  useEffect(() => {
    if (!refreshConversation || automaticScanStartedRef.current) {
      return;
    }
    automaticScanStartedRef.current = true;
    void handleRefreshConversation();
  }, [handleRefreshConversation, refreshConversation]);

  const showPreviousResponse = (): void => {
    setCopyStatus("idle");
    if (isNarrow) {
      setOutlineOpen(false);
    }
    setCurrentResponseIndex((index) => Math.max(0, index - 1));
  };

  const showNextResponse = (): void => {
    setCopyStatus("idle");
    if (isNarrow) {
      setOutlineOpen(false);
    }
    setCurrentResponseIndex((index) => Math.min(responses.length - 1, index + 1));
  };

  const scrollToTarget = (targetId: string): HTMLElement | null => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return null;
    }
    const target = Array.from(scrollArea.querySelectorAll<HTMLElement>("[id]")).find(
      (element) => element.id === targetId,
    );
    if (!target) {
      return null;
    }
    const top =
      scrollArea.scrollTop +
      target.getBoundingClientRect().top -
      scrollArea.getBoundingClientRect().top -
      16;
    if (typeof scrollArea.scrollTo === "function") {
      scrollArea.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      target.scrollIntoView({ block: "start" });
    }
    if (!target.hasAttribute("tabindex")) {
      target.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    if (isNarrow) {
      setOutlineOpen(false);
    }
    return target;
  };

  const selectGroup = (group: ConversationOutlineGroup): void => {
    setActiveSectionId(group.targetSectionId);
    setActiveHeadingId(null);
    scrollToTarget(group.targetSectionId);
  };

  const selectHeading = (group: ConversationOutlineGroup, item: OutlineItem): void => {
    setActiveSectionId(group.targetSectionId);
    setActiveHeadingId(item.targetHeadingId);
    scrollToTarget(item.targetHeadingId);
  };

  return (
    <div
      ref={dialogRef}
      className="rb-reader"
      data-appearance={preferences.appearance}
      data-preset={preferences.preset}
      data-mode={mode}
      data-code-appearance={preferences.codeAppearance}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rb-reader-title"
      style={readerStyle}
    >
      <header
        className="rb-toolbar rb-print-hidden"
        inert={feedbackOpen ? true : undefined}
        aria-hidden={feedbackOpen ? "true" : undefined}
      >
        <div className="rb-toolbar-primary">
          <div className="rb-identity">
            <div className="rb-brand">
              <div className="rb-product-label">
                <span className="rb-eyebrow">ReadBooster</span>
                <span className="rb-version-label">Beta · v{READER_VERSION}</span>
              </div>
              <h1 id="rb-reader-title">
                {mode === "document" ? documentTitle : "Focused response"}
              </h1>
            </div>
            <div className="rb-mode-switch" role="group" aria-label="Reader mode">
              <button
                type="button"
                aria-pressed={mode === "document"}
                onClick={() => changeMode("document")}
              >
                Document
              </button>
              <button
                type="button"
                aria-pressed={mode === "focus"}
                onClick={() => changeMode("focus")}
              >
                Focus
              </button>
            </div>
          </div>

          <div className="rb-header-controls" aria-label="Reader controls">
            <button
              ref={readingSettingsTriggerRef}
              type="button"
              aria-controls="rb-reading-settings-panel"
              aria-expanded={headerPanel === "reading-settings"}
              aria-haspopup="dialog"
              onClick={() => toggleHeaderPanel("reading-settings")}
            >
              Reading settings
            </button>
            <button
              ref={actionsTriggerRef}
              type="button"
              aria-controls="rb-actions-panel"
              aria-expanded={headerPanel === "actions"}
              aria-haspopup="dialog"
              onClick={() => toggleHeaderPanel("actions")}
            >
              Actions
            </button>
            <button
              ref={outlineToggleRef}
              type="button"
              aria-controls="rb-response-outline"
              aria-expanded={outlineOpen}
              aria-label={`${outlineOpen ? "Close" : "Open"} ${mode === "document" ? "conversation" : "response"} outline`}
              onClick={() => setOutlineOpen((open) => !open)}
            >
              {outlineOpen ? "Hide outline" : "Outline"}
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="rb-close"
              onClick={onClose}
              aria-label="Close reader"
            >
              Close
            </button>
          </div>
        </div>

        {mode === "focus" ? (
          <div className="rb-toolbar-secondary">
            <div className="rb-response-navigation" aria-label="Assistant response navigation">
              <button
                type="button"
                onClick={showPreviousResponse}
                disabled={currentResponseIndex === 0}
                aria-label="Show previous assistant response"
              >
                Previous
              </button>
              <output className="rb-response-position" aria-live="polite">
                Response {currentResponseIndex + 1} of {responses.length}
              </output>
              <button
                type="button"
                onClick={showNextResponse}
                disabled={currentResponseIndex === responses.length - 1}
                aria-label="Show next assistant response"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}

        {mode === "document" && refreshConversation ? (
          <p
            id="rb-refresh-status"
            className="rb-refresh-status rb-toolbar-scan-status"
            role="status"
            aria-live="polite"
          >
            {refreshMessage}
          </p>
        ) : null}

        {headerPanel ? (
          <div
            ref={headerPanelRef}
            id={
              headerPanel === "reading-settings" ? "rb-reading-settings-panel" : "rb-actions-panel"
            }
            className="rb-header-panel"
            data-panel={headerPanel}
            role="dialog"
            aria-labelledby={`${headerPanel}-title`}
          >
            {headerPanel === "reading-settings" ? (
              <>
                <h2 id="reading-settings-title">Reading settings</h2>
                <div className="rb-settings-grid">
                  <label>
                    <span>Preset</span>
                    <select
                      aria-label="Reading preset"
                      value={preferences.preset}
                      onChange={(event) => updatePreset(event.target.value as ReaderPreset)}
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="dyslexia-friendly">Dyslexia-friendly</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  <label>
                    <span>Code appearance</span>
                    <select
                      aria-label="Code appearance"
                      value={preferences.codeAppearance}
                      onChange={(event) =>
                        updatePreferences({
                          ...preferences,
                          codeAppearance: event.target.value as CodeAppearance,
                        })
                      }
                    >
                      <option value="color">Color</option>
                      <option value="plain">Plain</option>
                    </select>
                  </label>
                  <label>
                    <span>Open document at</span>
                    <select
                      aria-label="Open document at"
                      value={preferences.documentOpenAt}
                      onChange={(event) =>
                        updatePreferences({
                          ...preferences,
                          documentOpenAt: event.target.value as DocumentOpenAt,
                        })
                      }
                    >
                      <option value="latest">Latest section</option>
                      <option value="beginning">Beginning</option>
                    </select>
                  </label>
                  <label>
                    <span>Appearance</span>
                    <select
                      aria-label="Reader appearance"
                      value={preferences.appearance}
                      onChange={(event) =>
                        updatePreferences({
                          ...preferences,
                          appearance: event.target.value as AppearanceMode,
                        })
                      }
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                  <label>
                    <span>Text size</span>
                    <select
                      aria-label="Reader text size"
                      value={preferences.textSize}
                      onChange={(event) =>
                        updatePreferences({
                          ...preferences,
                          textSize: event.target.value as TextSize,
                          preset: "custom",
                        })
                      }
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                      <option value="x-large">Extra large</option>
                    </select>
                  </label>
                  <label>
                    <span>Spacing</span>
                    <select
                      aria-label="Reader spacing"
                      value={preferences.spacing}
                      onChange={(event) =>
                        updatePreferences({
                          ...preferences,
                          spacing: event.target.value as SpacingLevel,
                          preset: "custom",
                        })
                      }
                    >
                      <option value="compact">Compact</option>
                      <option value="comfortable">Comfortable</option>
                      <option value="roomy">Roomy</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <h2 id="actions-title">Actions</h2>
                <div className="rb-actions-list">
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    aria-label={
                      mode === "document" ? "Copy conversation document" : "Copy focused response"
                    }
                    aria-describedby="rb-copy-status"
                  >
                    {copyStatus === "copied"
                      ? "Copied"
                      : copyStatus === "failed"
                        ? "Copy failed"
                        : "Copy"}
                  </button>
                  <span
                    id="rb-copy-status"
                    className="rb-visually-hidden"
                    role="status"
                    aria-live="polite"
                  >
                    {copyStatus === "copied"
                      ? mode === "document"
                        ? "Conversation document copied."
                        : "Focused response copied."
                      : copyStatus === "failed"
                        ? "Copy failed."
                        : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    aria-label={
                      mode === "document" ? "Print conversation document" : "Print focused response"
                    }
                  >
                    Print
                  </button>
                  <button
                    ref={feedbackTriggerRef}
                    type="button"
                    onClick={openFeedback}
                    aria-label="Send feedback"
                    aria-haspopup="dialog"
                    aria-controls="rb-feedback-dialog"
                    aria-expanded={feedbackOpen}
                    title="Send feedback"
                  >
                    Feedback
                  </button>
                  {mode === "document" && refreshConversation ? (
                    <button
                      type="button"
                      onClick={() => void handleRefreshConversation()}
                      disabled={refreshStatus === "checking"}
                      aria-busy={refreshStatus === "checking"}
                      aria-describedby="rb-refresh-status"
                    >
                      {refreshStatus === "checking"
                        ? "Scanning conversation…"
                        : "Refresh conversation"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-controls="rb-about-readbooster"
                    aria-expanded={aboutOpen}
                    onClick={() => setAboutOpen((open) => !open)}
                  >
                    About ReadBooster
                  </button>
                </div>
                {aboutOpen ? (
                  <section
                    id="rb-about-readbooster"
                    className="rb-about-readbooster"
                    aria-label="About ReadBooster"
                  >
                    <h3>ReadBooster</h3>
                    <p>Version {READER_VERSION} Beta</p>
                    <p>ReadBooster processes content locally in your browser.</p>
                    <p>
                      ChatGPT conversation extraction is implemented. Claude and Gemini extraction
                      are not implemented.
                    </p>
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </header>

      <header
        className="rb-print-metadata"
        inert={feedbackOpen ? true : undefined}
        aria-hidden={feedbackOpen ? "true" : undefined}
      >
        <h1>{mode === "document" ? documentTitle : "ReadBooster — Focused response"}</h1>
        <p>
          {SOURCE_LABELS[accumulatedConversation.source]} ·{" "}
          {mode === "document"
            ? `${sections.length} assistant responses`
            : `Response ${currentResponseIndex + 1} of ${responses.length}`}
        </p>
      </header>

      <div
        className="rb-reader-body"
        data-outline-open={outlineOpen ? "true" : "false"}
        data-narrow={isNarrow ? "true" : "false"}
        inert={feedbackOpen ? true : undefined}
        aria-hidden={feedbackOpen ? "true" : undefined}
      >
        {mode === "document" ? (
          <>
            <ConversationOutline
              groups={outlineGroups}
              activeSectionId={activeSectionId}
              activeHeadingId={activeHeadingId}
              open={outlineOpen}
              onSelectGroup={selectGroup}
              onSelectHeading={selectHeading}
              onRenameSection={renameSection}
              onRestoreAutomaticTitle={restoreAutomaticSectionTitle}
              titleStatus={sectionTitleStatus}
            />
            <ContinuousDocumentView
              sections={sections}
              scrollAreaRef={scrollAreaRef}
              tableSessionStates={tableSessionStates}
              fullscreenCoordinator={fullscreenCoordinator}
              onActiveChange={handleActiveDocumentChange}
              codeAppearance={preferences.codeAppearance}
            />
          </>
        ) : (
          <FocusResponseView
            response={response}
            scrollAreaRef={scrollAreaRef}
            outlineOpen={outlineOpen}
            tableSessionStates={tableSessionStates}
            fullscreenCoordinator={fullscreenCoordinator}
            codeAppearance={preferences.codeAppearance}
          />
        )}
      </div>
      {feedbackOpen ? <FeedbackModal onClose={closeFeedback} /> : null}
    </div>
  );
}
