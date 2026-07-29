import type { HighlightRecord } from "../../shared/highlights";

export interface HighlightOverviewEntry {
  readonly highlight: HighlightRecord;
  readonly sectionTitle: string;
  readonly sectionIndex: number;
  readonly blockOrder: number;
}

interface HighlightOverviewProps {
  entries: readonly HighlightOverviewEntry[];
  activeHighlightId: string | null;
  onNavigate: (highlightId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}

const STYLE_LABELS: Record<HighlightRecord["style"], string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  pink: "Pink",
};

function excerpt(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}…` : normalized;
}

export function HighlightOverview({
  entries,
  activeHighlightId,
  onNavigate,
  onPrevious,
  onNext,
}: HighlightOverviewProps) {
  const currentIndex = entries.findIndex((entry) => entry.highlight.id === activeHighlightId);
  return (
    <section className="rb-highlight-overview" aria-labelledby="rb-highlights-title">
      <div className="rb-highlight-overview-heading">
        <div>
          <h2 id="rb-highlights-title">Highlights</h2>
          <p>
            {entries.length} saved passage{entries.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rb-highlight-navigation" aria-label="Highlight navigation">
          <button
            type="button"
            onClick={onPrevious}
            disabled={entries.length === 0 || currentIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={entries.length === 0 || currentIndex === entries.length - 1}
          >
            Next
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="rb-highlight-empty">
          Select text in the Reader to save an important passage.
        </p>
      ) : (
        <ol className="rb-highlight-list">
          {entries.map((entry, index) => (
            <li key={entry.highlight.id}>
              <button
                type="button"
                aria-current={index === currentIndex ? "true" : undefined}
                onClick={() => onNavigate(entry.highlight.id)}
              >
                <span
                  className={`rb-highlight-list-swatch rb-highlight-list-swatch--${entry.highlight.style}`}
                >
                  {STYLE_LABELS[entry.highlight.style]}
                </span>
                <strong>{entry.sectionTitle || `Section ${entry.sectionIndex + 1}`}</strong>
                <span>{excerpt(entry.highlight.selectedText)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
