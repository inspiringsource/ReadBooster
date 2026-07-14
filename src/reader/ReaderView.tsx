import { useEffect, useMemo, useRef, useState } from "react";

import { preferencesForPreset } from "../shared/preferences";
import { saveReaderPreferences } from "../shared/storage";
import type {
  AppearanceMode,
  ExtractedResponse,
  ReaderPreferences,
  ReaderPreset,
  SpacingLevel,
  TextSize,
} from "../shared/types";

interface ReaderViewProps {
  response: ExtractedResponse;
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

export function ReaderView({ response, initialPreferences, onClose }: ReaderViewProps) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
      <header className="rb-toolbar">
        <div className="rb-brand">
          <span className="rb-eyebrow">ReadBooster</span>
          <h1 id="rb-reader-title">Optimized response</h1>
        </div>

        <div className="rb-controls" aria-label="Reader preferences">
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

          <button type="button" onClick={() => void handleCopy()} aria-label="Copy response text">
            {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy"}
          </button>
          <button type="button" onClick={() => window.print()} aria-label="Print response">
            Print
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

      <main className="rb-scroll-area">
        <article
          className="rb-content"
          aria-label="Latest assistant response"
          dangerouslySetInnerHTML={{ __html: response.html }}
        />
      </main>
    </div>
  );
}
