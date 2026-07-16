import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FEEDBACK_FORM_URL, openFeedbackForm } from "./feedback";

interface FeedbackModalProps {
  onClose: () => void;
}

type FeedbackFrameState = "failed" | "loaded" | "loading";

const FEEDBACK_LOAD_TIMEOUT_MS = 15_000;

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [frameState, setFrameState] = useState<FeedbackFrameState>("loading");
  const [fallbackStatus, setFallbackStatus] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (frameState !== "loading") {
      return;
    }
    const timeout = window.setTimeout(() => setFrameState("failed"), FEEDBACK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [frameState]);

  useEffect(() => {
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
          'button:not([disabled]), iframe, [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const root = dialogRef.current.getRootNode();
      const activeElement =
        root instanceof ShadowRoot ? root.activeElement : document.activeElement;
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

  const handleFallback = (): void => {
    setFallbackStatus(openFeedbackForm() ? "" : "Could not open the feedback form in a new tab.");
  };

  return (
    <div className="rb-feedback-overlay rb-print-hidden" data-rb-feedback-overlay>
      <section
        ref={dialogRef}
        id="rb-feedback-dialog"
        className="rb-feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rb-feedback-dialog-title"
      >
        <header className="rb-feedback-dialog-header">
          <div>
            <span className="rb-eyebrow">ReadBooster</span>
            <h2 id="rb-feedback-dialog-title">Feedback</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close feedback form"
          >
            Close
          </button>
        </header>

        <div className="rb-feedback-dialog-body">
          {frameState === "failed" ? (
            <div className="rb-feedback-failure" role="status" aria-live="polite">
              <p>The feedback form could not be displayed.</p>
              <button type="button" onClick={handleFallback}>
                Open feedback form in a new tab
              </button>
              {fallbackStatus ? <p className="rb-action-status">{fallbackStatus}</p> : null}
            </div>
          ) : (
            <>
              {frameState === "loading" ? (
                <p className="rb-feedback-loading" role="status" aria-live="polite">
                  Loading feedback form…
                </p>
              ) : null}
              <iframe
                className="rb-feedback-frame"
                data-state={frameState}
                src={FEEDBACK_FORM_URL}
                title="ReadBooster feedback form"
                referrerPolicy="no-referrer"
                onLoad={() => setFrameState("loaded")}
                onError={() => setFrameState("failed")}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
