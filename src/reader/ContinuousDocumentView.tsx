import { useEffect, type RefObject } from "react";

import type { CodeAppearance } from "../shared/types";
import { recordConversationPipelineDiagnostics } from "../shared/developmentDiagnostics";
import type { TableDisplayState, TableFullscreenCoordinator } from "./blockControls";
import { flattenOutline } from "./outline";
import type { ConversationSection } from "./presentation";
import { PromptDisclosure } from "./PromptDisclosure";
import { ResponseContent } from "./ResponseContent";

interface ContinuousDocumentViewProps {
  sections: readonly ConversationSection[];
  scrollAreaRef: RefObject<HTMLElement | null>;
  tableSessionStates: Map<string, TableDisplayState>;
  fullscreenCoordinator: TableFullscreenCoordinator;
  onActiveChange: (sectionId: string, headingId: string | null) => void;
  codeAppearance: CodeAppearance;
}

export function ContinuousDocumentView({
  sections,
  scrollAreaRef,
  tableSessionStates,
  fullscreenCoordinator,
  onActiveChange,
  codeAppearance,
}: ContinuousDocumentViewProps) {
  if (import.meta.env.DEV) {
    recordConversationPipelineDiagnostics({ renderedDocumentSections: sections.length });
  }

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) {
      return;
    }

    const sectionTargets = sections.flatMap((section) => {
      const element = scrollArea.querySelector<HTMLElement>(`#${section.id}`);
      return element ? [{ section, element }] : [];
    });
    const renderedHeadings = new Map(
      Array.from(
        scrollArea.querySelectorAll<HTMLElement>(
          ".rb-content h1, .rb-content h2, .rb-content h3, .rb-content h4, .rb-content h5, .rb-content h6",
        ),
        (heading) => [heading.id, heading] as const,
      ),
    );
    const headingTargets = sections.flatMap((section) =>
      flattenOutline(section.outline).flatMap((item) => {
        const element = renderedHeadings.get(item.targetHeadingId);
        return element ? [{ sectionId: section.id, headingId: item.targetHeadingId, element }] : [];
      }),
    );

    const updateActive = (): void => {
      const rootTop = scrollArea.getBoundingClientRect().top;
      const passedSections = sectionTargets.filter(
        ({ element }) => element.getBoundingClientRect().top <= rootTop + 48,
      );
      const activeSection = (passedSections.at(-1) ?? sectionTargets[0])?.section;
      if (!activeSection) {
        return;
      }
      const sectionHeadings = headingTargets.filter(
        (heading) =>
          heading.sectionId === activeSection.id &&
          heading.element.getBoundingClientRect().top <= rootTop + 72,
      );
      onActiveChange(activeSection.id, sectionHeadings.at(-1)?.headingId ?? null);
    };

    scrollArea.addEventListener("scroll", updateActive, { passive: true });
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(updateActive, {
        root: scrollArea,
        rootMargin: "-12px 0px -70% 0px",
        threshold: [0, 1],
      });
      sectionTargets.forEach(({ element }) => observer?.observe(element));
      headingTargets.forEach(({ element }) => observer?.observe(element));
    }

    return () => {
      scrollArea.removeEventListener("scroll", updateActive);
      observer?.disconnect();
    };
  }, [onActiveChange, scrollAreaRef, sections]);

  return (
    <main
      ref={scrollAreaRef}
      className="rb-scroll-area rb-document-scroll"
      data-rb-scroll-container="vertical"
      aria-label="Conversation document"
    >
      <article className="rb-document-surface">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="rb-document-section"
            data-rb-section-id={section.id}
            data-rb-response-id={section.responseBlockId}
            tabIndex={-1}
            aria-labelledby={`${section.id}-title`}
          >
            <header className="rb-document-section-header">
              <span className="rb-section-indicator">Section {section.index + 1}</span>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
            </header>
            {section.prompt ? <PromptDisclosure prompt={section.prompt} /> : null}
            <ResponseContent
              response={section.response}
              tableSessionStates={tableSessionStates}
              fullscreenCoordinator={fullscreenCoordinator}
              variant="document"
              codeAppearance={codeAppearance}
            />
          </section>
        ))}
      </article>
    </main>
  );
}
