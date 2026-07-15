import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import packageJson from "../../package.json";
import { preferencesForPreset } from "../shared/preferences";
import { saveReaderPreferences } from "../shared/storage";
import type {
  AppearanceMode,
  ConversationDocument,
  ReaderPreferences,
  ReaderPreset,
  SpacingLevel,
  TextSize,
} from "../shared/types";
import type { TableDisplayState, TableFullscreenCoordinator } from "./blockControls";
import { ContinuousDocumentView } from "./ContinuousDocumentView";
import { ConversationOutline } from "./ConversationOutline";
import { FocusResponseView } from "./FocusResponseView";
import type { OutlineItem } from "./outline";
import {
  conversationCopyText,
  deriveConversationOutline,
  deriveConversationSections,
  type ConversationOutlineGroup,
  type ReaderMode,
} from "./presentation";

interface ReaderViewProps {
  conversation: ConversationDocument;
  initialResponseId?: string;
  initialPreferences: ReaderPreferences;
  onClose: () => void;
}

type HeaderPanel = "actions" | "reading-settings";

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
  onClose,
}: ReaderViewProps) {
  const sections = useMemo(() => deriveConversationSections(conversation), [conversation]);
  const outlineGroups = useMemo(() => deriveConversationOutline(sections), [sections]);
  const responses = useMemo(() => sections.map((section) => section.response), [sections]);
  const requestedInitialIndex = responses.findIndex(
    (response) => response.id === initialResponseId,
  );
  const initialResponseIndex =
    requestedInitialIndex >= 0 ? requestedInitialIndex : responses.length - 1;
  const [mode, setMode] = useState<ReaderMode>("document");
  const [preferences, setPreferences] = useState(initialPreferences);
  const [currentResponseIndex, setCurrentResponseIndex] = useState(initialResponseIndex);
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
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
  const headerPanelRef = useRef<HTMLDivElement>(null);
  const documentScrollTopRef = useRef(0);
  const [tableSessionStates] = useState(() => new Map<string, TableDisplayState>());
  const [fullscreenCoordinator] = useState<TableFullscreenCoordinator>(() => ({
    activeClose: null,
  }));
  const response = responses[currentResponseIndex];
  const documentTitle = conversation.title?.trim() || "Conversation document.";

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
  }, [closeHeaderPanel, headerPanel]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const fullscreenTable = dialogRef.current?.querySelector('[data-rb-table-fullscreen="true"]');
      if (fullscreenTable) {
        return;
      }

      if (event.key === "Escape") {
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
  }, [closeHeaderPanel, headerPanel, onClose]);

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
    updatePreferences(preferencesForPreset(preset, preferences.appearance));
  };

  const handleActiveDocumentChange = useCallback(
    (sectionId: string, headingId: string | null): void => {
      setActiveSectionId(sectionId);
      setActiveHeadingId(headingId);
    },
    [],
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="rb-reader-title"
      style={readerStyle}
    >
      <header className="rb-toolbar rb-print-hidden">
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

      <header className="rb-print-metadata">
        <h1>{mode === "document" ? documentTitle : "ReadBooster — Focused response"}</h1>
        <p>
          {SOURCE_LABELS[conversation.source]} ·{" "}
          {mode === "document"
            ? `${sections.length} assistant responses`
            : `Response ${currentResponseIndex + 1} of ${responses.length}`}
        </p>
      </header>

      <div
        className="rb-reader-body"
        data-outline-open={outlineOpen ? "true" : "false"}
        data-narrow={isNarrow ? "true" : "false"}
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
            />
            <ContinuousDocumentView
              sections={sections}
              scrollAreaRef={scrollAreaRef}
              tableSessionStates={tableSessionStates}
              fullscreenCoordinator={fullscreenCoordinator}
              onActiveChange={handleActiveDocumentChange}
            />
          </>
        ) : (
          <FocusResponseView
            response={response}
            scrollAreaRef={scrollAreaRef}
            outlineOpen={outlineOpen}
            tableSessionStates={tableSessionStates}
            fullscreenCoordinator={fullscreenCoordinator}
          />
        )}
      </div>
    </div>
  );
}
