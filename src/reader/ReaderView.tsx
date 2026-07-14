import { useEffect, useMemo, useRef, useState } from "react";

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
import { assistantBlocks } from "../shared/types";
import type { TableDisplayState } from "./blockControls";
import { ResponseContent } from "./ResponseContent";
import { ResponseOutline } from "./ResponseOutline";

interface ReaderViewProps {
  conversation: ConversationDocument;
  initialResponseId?: string;
  initialPreferences: ReaderPreferences;
  onClose: () => void;
}

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
  const responses = useMemo(() => assistantBlocks(conversation), [conversation]);
  const initialResponseIndex = Math.max(
    0,
    responses.findIndex((response) => response.id === initialResponseId),
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [currentResponseIndex, setCurrentResponseIndex] = useState(initialResponseIndex);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches,
  );
  const [outlineOpen, setOutlineOpen] = useState(() => !isNarrow);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [tableSessionStates] = useState(() => new Map<string, TableDisplayState>());
  const response = responses[currentResponseIndex];

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

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      const fullscreenTable = dialogRef.current?.querySelector('[data-rb-table-fullscreen="true"]');
      if (fullscreenTable) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
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
          'button:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex="-1"]):not([hidden])',
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
  }, [onClose]);

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

  const updateAppearance = (appearance: AppearanceMode): void => {
    updatePreferences({ ...preferences, appearance });
  };

  const updateTextSize = (textSize: TextSize): void => {
    updatePreferences({ ...preferences, textSize, preset: "custom" });
  };

  const updateSpacing = (spacing: SpacingLevel): void => {
    updatePreferences({ ...preferences, spacing, preset: "custom" });
  };

  const updatePreset = (preset: ReaderPreset): void => {
    if (preset === "custom") {
      updatePreferences({ ...preferences, preset });
      return;
    }
    updatePreferences(preferencesForPreset(preset, preferences.appearance));
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await copyText(response.text);
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

  return (
    <div
      ref={dialogRef}
      className="rb-reader"
      data-appearance={preferences.appearance}
      data-preset={preferences.preset}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rb-reader-title"
      style={readerStyle}
    >
      <header className="rb-toolbar rb-print-hidden">
        <div className="rb-brand">
          <span className="rb-eyebrow">ReadBooster</span>
          <h1 id="rb-reader-title">Optimized response</h1>
        </div>

        <div className="rb-controls" aria-label="Reader preferences">
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
              onChange={(event) => updateAppearance(event.target.value as AppearanceMode)}
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
              onChange={(event) => updateTextSize(event.target.value as TextSize)}
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
              onChange={(event) => updateSpacing(event.target.value as SpacingLevel)}
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="roomy">Roomy</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Copy response text"
            aria-describedby="rb-copy-status"
          >
            {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}
          </button>
          <span id="rb-copy-status" className="rb-visually-hidden" role="status" aria-live="polite">
            {copyStatus === "copied"
              ? "Response copied."
              : copyStatus === "failed"
                ? "Copy failed."
                : ""}
          </span>
          <button type="button" onClick={() => window.print()} aria-label="Print response">
            Print
          </button>
          <button
            type="button"
            aria-controls="rb-response-outline"
            aria-expanded={outlineOpen}
            aria-label={outlineOpen ? "Close response outline" : "Open response outline"}
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
      </header>

      <header className="rb-print-metadata">
        <h1>ReadBooster — Optimized response</h1>
        <p>
          {SOURCE_LABELS[conversation.source]} · Response {currentResponseIndex + 1} of{" "}
          {responses.length}
        </p>
      </header>

      <div
        className="rb-reader-body"
        data-outline-open={outlineOpen ? "true" : "false"}
        data-narrow={isNarrow ? "true" : "false"}
      >
        <ResponseOutline
          key={`${response.id}:${outlineOpen ? "open" : "closed"}`}
          response={response}
          scrollAreaRef={scrollAreaRef}
          open={outlineOpen}
        />
        <main
          ref={scrollAreaRef}
          className="rb-scroll-area"
          data-rb-scroll-container="vertical"
          aria-label="Reader content"
        >
          <ResponseContent response={response} tableSessionStates={tableSessionStates} />
        </main>
      </div>
    </div>
  );
}
