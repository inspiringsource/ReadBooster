import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { CodeAppearance } from "../../shared/types";
import type { TableDisplayState, TableFullscreenCoordinator } from "../blockControls";
import { PrintStudioContent } from "./PrintStudioContent";
import {
  createDefaultPrintStudioSettings,
  movePrintSection,
  orderedPrintSections,
  printPageSetup,
  PRINT_CONTENT_WIDTHS,
  PRINT_FONT_POINTS,
  PRINT_LINE_HEIGHTS,
  PRINT_MARGIN_MILLIMETERS,
  PRINT_PREVIEW_WIDTHS,
  type PrintPageSetup,
  type PrintStudioDocument,
  type PrintStudioSettings,
} from "./printStudioModel";

interface PrintStudioProps {
  document: PrintStudioDocument;
  codeAppearance: CodeAppearance;
  onClose: () => void;
  onPageSetupChange: (setup: PrintPageSetup | null) => void;
}

const SOURCE_LABELS: Record<PrintStudioDocument["source"], string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  mistral: "Mistral",
};

function toggleValue(values: readonly string[], value: string, enabled: boolean): string[] {
  if (enabled) {
    return values.includes(value) ? [...values] : [...values, value];
  }
  return values.filter((candidate) => candidate !== value);
}

export function PrintStudio({
  document,
  codeAppearance,
  onClose,
  onPageSetupChange,
}: PrintStudioProps) {
  const [settings, setSettings] = useState<PrintStudioSettings>(() =>
    createDefaultPrintStudioSettings(document),
  );
  const [printStatus, setPrintStatus] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [tableSessionStates] = useState(() => new Map<string, TableDisplayState>());
  const [fullscreenCoordinator] = useState<TableFullscreenCoordinator>(() => ({
    activeClose: null,
  }));
  const visibleSections = useMemo(
    () => orderedPrintSections(document, settings),
    [document, settings],
  );
  const pageBreaks = useMemo(() => new Set(settings.pageBreakBeforeIds), [settings]);
  const pageSetup = useMemo(() => printPageSetup(settings), [settings]);
  const hasPrintableContent =
    visibleSections.length > 0 &&
    (settings.includeResponses ||
      settings.includePrompts ||
      (settings.includeStickers && visibleSections.some((section) => section.stickers.length > 0)));
  const previewStyle = {
    "--rb-print-preview-width": PRINT_PREVIEW_WIDTHS[settings.pageSize][settings.orientation],
    "--rb-print-preview-margin": `${PRINT_MARGIN_MILLIMETERS[settings.margins] * 3.78}px`,
    "--rb-print-font-size": `${PRINT_FONT_POINTS[settings.fontSize]}pt`,
    "--rb-print-line-height": String(PRINT_LINE_HEIGHTS[settings.lineSpacing]),
    "--rb-print-content-width": PRINT_CONTENT_WIDTHS[settings.contentWidth],
  } as CSSProperties;

  useEffect(() => {
    onPageSetupChange(pageSetup);
  }, [onPageSetupChange, pageSetup]);

  useEffect(
    () => () => {
      onPageSetupChange(null);
    },
    [onPageSetupChange],
  );

  useLayoutEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hidden);
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const root = dialogRef.current.getRootNode();
      const active =
        root instanceof ShadowRoot ? root.activeElement : globalThis.document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const updateSettings = (patch: Partial<PrintStudioSettings>): void => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const handlePrint = (): void => {
    if (!hasPrintableContent) {
      setPrintStatus("Select at least one printable section and content type.");
      return;
    }
    setPrintStatus("Opening the browser print dialog. Choose Save as PDF to create a PDF file.");
    window.print();
  };

  return (
    <div
      ref={dialogRef}
      className="rb-print-studio"
      data-include-images={settings.includeImages ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rb-print-studio-title"
      style={previewStyle}
    >
      <header className="rb-print-studio-toolbar rb-print-studio-controls">
        <div>
          <span className="rb-eyebrow">ReadBooster</span>
          <h2 id="rb-print-studio-title">Print Studio</h2>
          <p>Prepare a local print document without changing your Reader.</p>
        </div>
        <div className="rb-print-studio-actions">
          <button type="button" onClick={handlePrint} disabled={!hasPrintableContent}>
            Print
          </button>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            Back to Reader
          </button>
        </div>
      </header>

      <div className="rb-print-studio-body">
        <aside
          className="rb-print-studio-settings rb-print-studio-controls"
          aria-label="Print settings"
        >
          <fieldset>
            <legend>Content</legend>
            <label>
              <input
                type="checkbox"
                checked={settings.includePrompts}
                onChange={(event) => updateSettings({ includePrompts: event.target.checked })}
              />
              User prompts
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.includeResponses}
                onChange={(event) => updateSettings({ includeResponses: event.target.checked })}
              />
              Assistant responses
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.includeStickers}
                onChange={(event) => updateSettings({ includeStickers: event.target.checked })}
              />
              Stickers
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.showHighlights}
                disabled={!settings.includeResponses}
                onChange={(event) => updateSettings({ showHighlights: event.target.checked })}
              />
              Show highlight styling
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings.includeImages}
                disabled={!settings.includeResponses && !settings.includePrompts}
                onChange={(event) => updateSettings({ includeImages: event.target.checked })}
              />
              Images
            </label>
          </fieldset>

          <fieldset className="rb-print-layout-controls">
            <legend>Layout</legend>
            <label>
              <span>Page size</span>
              <select
                value={settings.pageSize}
                onChange={(event) =>
                  updateSettings({
                    pageSize: event.target.value as PrintStudioSettings["pageSize"],
                  })
                }
              >
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            </label>
            <label>
              <span>Orientation</span>
              <select
                value={settings.orientation}
                onChange={(event) =>
                  updateSettings({
                    orientation: event.target.value as PrintStudioSettings["orientation"],
                  })
                }
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label>
              <span>Margins</span>
              <select
                value={settings.margins}
                onChange={(event) =>
                  updateSettings({ margins: event.target.value as PrintStudioSettings["margins"] })
                }
              >
                <option value="compact">Compact</option>
                <option value="standard">Standard</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
            <label>
              <span>Font size</span>
              <select
                value={settings.fontSize}
                onChange={(event) =>
                  updateSettings({
                    fontSize: event.target.value as PrintStudioSettings["fontSize"],
                  })
                }
              >
                <option value="compact">Compact</option>
                <option value="standard">Standard</option>
                <option value="readable">Readable</option>
              </select>
            </label>
            <label>
              <span>Line spacing</span>
              <select
                value={settings.lineSpacing}
                onChange={(event) =>
                  updateSettings({
                    lineSpacing: event.target.value as PrintStudioSettings["lineSpacing"],
                  })
                }
              >
                <option value="compact">Compact</option>
                <option value="standard">Standard</option>
                <option value="readable">Readable</option>
              </select>
            </label>
            <label>
              <span>Content width</span>
              <select
                value={settings.contentWidth}
                onChange={(event) =>
                  updateSettings({
                    contentWidth: event.target.value as PrintStudioSettings["contentWidth"],
                  })
                }
              >
                <option value="narrow">Narrow</option>
                <option value="standard">Standard</option>
                <option value="full">Full page</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>Sections</legend>
            <div className="rb-print-section-actions">
              <button
                type="button"
                onClick={() =>
                  updateSettings({
                    includedSectionIds: document.sections.map((section) => section.id),
                  })
                }
              >
                Include all
              </button>
              <button type="button" onClick={() => updateSettings({ includedSectionIds: [] })}>
                Include none
              </button>
            </div>
            <ol className="rb-print-section-list">
              {settings.sectionOrder.map((sectionId, orderIndex) => {
                const section = document.sections.find((candidate) => candidate.id === sectionId)!;
                const included = settings.includedSectionIds.includes(sectionId);
                return (
                  <li key={sectionId}>
                    <label className="rb-print-section-toggle">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={(event) =>
                          updateSettings({
                            includedSectionIds: toggleValue(
                              settings.includedSectionIds,
                              sectionId,
                              event.target.checked,
                            ),
                          })
                        }
                      />
                      <span>{section.title}</span>
                    </label>
                    <div className="rb-print-section-row-actions">
                      <button
                        type="button"
                        aria-label={`Move “${section.title}” earlier`}
                        disabled={orderIndex === 0}
                        onClick={() =>
                          updateSettings({
                            sectionOrder: movePrintSection(settings.sectionOrder, sectionId, -1),
                          })
                        }
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        aria-label={`Move “${section.title}” later`}
                        disabled={orderIndex === settings.sectionOrder.length - 1}
                        onClick={() =>
                          updateSettings({
                            sectionOrder: movePrintSection(settings.sectionOrder, sectionId, 1),
                          })
                        }
                      >
                        Down
                      </button>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.pageBreakBeforeIds.includes(sectionId)}
                          onChange={(event) =>
                            updateSettings({
                              pageBreakBeforeIds: toggleValue(
                                settings.pageBreakBeforeIds,
                                sectionId,
                                event.target.checked,
                              ),
                            })
                          }
                        />
                        New page
                      </label>
                    </div>
                  </li>
                );
              })}
            </ol>
          </fieldset>
          <p className="rb-print-studio-help">
            Printing stays local. Use the browser dialog’s Save as PDF option to create a PDF.
          </p>
        </aside>

        <main className="rb-print-preview" aria-label="Print preview">
          <article className="rb-print-page">
            <div className="rb-print-page-content">
              <header className="rb-print-document-header">
                <h1>{document.title}</h1>
                <p>
                  {SOURCE_LABELS[document.source]} · {visibleSections.length} of{" "}
                  {document.sections.length} sections
                </p>
              </header>
              {visibleSections.length === 0 ? (
                <p className="rb-print-empty">Select at least one section to preview it.</p>
              ) : (
                visibleSections.map((section, visibleIndex) => (
                  <section
                    key={section.id}
                    className="rb-print-document-section"
                    data-page-break={
                      visibleIndex > 0 && pageBreaks.has(section.id) ? "true" : "false"
                    }
                    aria-labelledby={`rb-print-title-${section.id}`}
                  >
                    <header>
                      <span>Section {section.originalIndex + 1}</span>
                      <h2 id={`rb-print-title-${section.id}`}>{section.title}</h2>
                    </header>
                    {settings.includePrompts && section.prompt ? (
                      <section className="rb-print-prompt" aria-label="User prompt">
                        <h3>Prompt</h3>
                        <PrintStudioContent
                          key={`${section.prompt.id}:${settings.includeImages}`}
                          responseId={section.prompt.id}
                          html={section.prompt.html}
                          contentKind="prompt"
                          highlights={[]}
                          showHighlights={false}
                          includeImages={settings.includeImages}
                          codeAppearance={codeAppearance}
                          tableSessionStates={tableSessionStates}
                          fullscreenCoordinator={fullscreenCoordinator}
                        />
                      </section>
                    ) : null}
                    {settings.includeResponses ? (
                      <PrintStudioContent
                        key={`${section.response.id}:${settings.includeImages}`}
                        responseId={section.response.id}
                        html={section.response.html}
                        contentKind="response"
                        highlights={section.highlights}
                        showHighlights={settings.showHighlights}
                        includeImages={settings.includeImages}
                        codeAppearance={codeAppearance}
                        tableSessionStates={tableSessionStates}
                        fullscreenCoordinator={fullscreenCoordinator}
                      />
                    ) : null}
                    {settings.includeStickers && section.stickers.length > 0 ? (
                      <aside
                        className="rb-print-stickers"
                        aria-label={`Stickers for ${section.title}`}
                      >
                        <h3>Stickers</h3>
                        <ul>
                          {section.stickers.map((sticker) => (
                            <li key={sticker.id}>{sticker.text}</li>
                          ))}
                        </ul>
                      </aside>
                    ) : null}
                  </section>
                ))
              )}
            </div>
          </article>
        </main>
      </div>
      <p className="rb-visually-hidden" role="status" aria-live="polite">
        {printStatus}
      </p>
    </div>
  );
}
