export type BlockDisplayDensity = "compact" | "normal" | "large";
export type TableDisplayMode = "fit" | "wide";

export interface TableDisplayState {
  mode: TableDisplayMode;
  density: Extract<BlockDisplayDensity, "compact" | "normal">;
}

export interface EnhanceTablesOptions {
  responseKey: string;
  sessionStates: Map<string, TableDisplayState>;
}

interface EnhancedTable {
  block: HTMLDivElement;
  table: HTMLTableElement;
  cleanup: () => void;
}

function getColumnCount(table: HTMLTableElement): number {
  let maximum = 1;
  for (const row of table.rows) {
    const columns = Array.from(row.cells).reduce((total, cell) => {
      const span = Number.parseInt(cell.getAttribute("colspan") ?? "1", 10);
      return total + (Number.isFinite(span) && span > 0 ? span : 1);
    }, 0);
    maximum = Math.max(maximum, columns);
  }
  return maximum;
}

function getDefaultState(): TableDisplayState {
  return { mode: "fit", density: "normal" };
}

function getFitMinimumWidth(columnCount: number): number {
  if (columnCount === 1) {
    return 18;
  }
  if (columnCount === 2) {
    return 30;
  }
  if (columnCount === 3) {
    return 38;
  }
  return Math.min(72, columnCount * 9);
}

function getWideMinimumWidth(columnCount: number): number {
  return Math.max(getFitMinimumWidth(columnCount), Math.min(110, columnCount * 11));
}

function createToolbarButton(
  document: Document,
  label: string,
  ariaLabel: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function getShadowActiveElement(element: Element): Element | null {
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.activeElement : element.ownerDocument.activeElement;
}

function markLongUnbrokenTokens(table: HTMLTableElement): HTMLSpanElement[] {
  const spans: HTMLSpanElement[] = [];
  const textNodes: Text[] = [];
  const walker = table.ownerDocument.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest("a, code") && /\S{32,}/.test(textNode.data)) {
      textNodes.push(textNode);
    }
  }

  for (const textNode of textNodes) {
    const fragment = table.ownerDocument.createDocumentFragment();
    const parts = textNode.data.split(/(\S{32,})/g);
    for (const part of parts) {
      if (/^\S{32,}$/.test(part)) {
        const span = table.ownerDocument.createElement("span");
        span.className = "rb-table-long-token";
        span.textContent = part;
        spans.push(span);
        fragment.append(span);
      } else if (part) {
        fragment.append(table.ownerDocument.createTextNode(part));
      }
    }
    textNode.replaceWith(fragment);
  }
  return spans;
}

export function enhanceTables(root: HTMLElement, options: EnhanceTablesOptions): () => void {
  const enhancedTables: EnhancedTable[] = [];
  const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table")).filter(
    (table) => !table.closest(".rb-table-block"),
  );

  tables.forEach((table, tableIndex) => {
    const document = table.ownerDocument;
    const stateKey = `${options.responseKey}:table-${tableIndex}`;
    const columnCount = getColumnCount(table);
    const defaultState = getDefaultState();
    let state = options.sessionStates.get(stateKey) ?? defaultState;
    let fullscreen = false;
    let fullscreenTrigger: HTMLElement | null = null;
    const longTokenSpans = markLongUnbrokenTokens(table);

    const block = document.createElement("div");
    block.className = "rb-table-block";
    block.dataset.rbTableEnhanced = "true";
    block.dataset.layout = "viewport-constrained";
    block.dataset.columns = String(columnCount);
    block.dataset.printWidthPressure = columnCount >= 6 ? "high" : "normal";
    if (columnCount >= 6) {
      block.classList.add("rb-table-print-wide");
    }
    block.style.setProperty("--rb-table-panel-inline-gutter", "32px");
    block.style.setProperty("--rb-table-fit-min-width", `${getFitMinimumWidth(columnCount)}rem`);
    block.style.setProperty("--rb-table-wide-min-width", `${getWideMinimumWidth(columnCount)}rem`);
    if (columnCount === 2) {
      block.style.setProperty("--rb-table-first-column-width", "clamp(8rem, 28%, 16rem)");
    }

    const toolbar = document.createElement("div");
    toolbar.className = "rb-block-toolbar rb-print-hidden";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", `Table ${tableIndex + 1} display controls`);

    const toolbarTitle = document.createElement("span");
    toolbarTitle.className = "rb-block-toolbar-title";
    toolbarTitle.textContent = `Table ${tableIndex + 1}`;

    const fitButton = createToolbarButton(document, "Fit", `Fit table ${tableIndex + 1}`);
    const wideButton = createToolbarButton(
      document,
      "Wide",
      `Use wide mode for table ${tableIndex + 1}`,
    );
    const fullscreenButton = createToolbarButton(
      document,
      "Fullscreen",
      `Open table ${tableIndex + 1} fullscreen`,
    );
    const compactButton = createToolbarButton(
      document,
      "Compact text",
      `Toggle compact text for table ${tableIndex + 1}`,
    );
    const resetButton = createToolbarButton(
      document,
      "Reset",
      `Reset table ${tableIndex + 1} display`,
    );
    const closeButton = createToolbarButton(
      document,
      "Close fullscreen",
      `Close fullscreen table ${tableIndex + 1}`,
    );
    closeButton.className = "rb-table-fullscreen-close";
    closeButton.hidden = true;

    toolbar.append(
      toolbarTitle,
      fitButton,
      wideButton,
      fullscreenButton,
      compactButton,
      resetButton,
      closeButton,
    );

    const scrollContainer = document.createElement("div");
    scrollContainer.className = "rb-table-scroll";
    scrollContainer.dataset.rbScrollViewport = "true";
    scrollContainer.tabIndex = 0;
    scrollContainer.setAttribute("role", "region");
    scrollContainer.setAttribute("aria-label", `Scrollable table ${tableIndex + 1}`);

    const viewport = document.createElement("div");
    viewport.className = "rb-table-viewport";

    const printHint =
      columnCount >= 6
        ? Object.assign(document.createElement("p"), {
            className: "rb-table-print-hint",
            textContent: "Wide table: Landscape orientation may improve readability.",
          })
        : null;

    table.replaceWith(block);
    scrollContainer.append(table);
    viewport.append(scrollContainer);
    if (printHint) {
      block.append(printHint);
    }
    block.append(toolbar, viewport);

    const view = document.defaultView;
    const layoutContainer = block.closest<HTMLElement>(".rb-scroll-area");
    let animationFrame: number | null = null;

    const updatePanelWidth = (): void => {
      if (!layoutContainer || !view || layoutContainer.clientWidth <= 0) {
        return;
      }
      const containerStyle = view.getComputedStyle(layoutContainer);
      const horizontalPadding =
        (Number.parseFloat(containerStyle.paddingLeft) || 0) +
        (Number.parseFloat(containerStyle.paddingRight) || 0);
      const availableWidth = Math.max(0, layoutContainer.clientWidth - horizontalPadding);
      if (availableWidth > 0) {
        block.style.setProperty("--rb-table-panel-width", `${Math.floor(availableWidth)}px`);
      }
    };

    const updateScrollAffordances = (): void => {
      const maximumScrollLeft = Math.max(
        0,
        scrollContainer.scrollWidth - scrollContainer.clientWidth,
      );
      const hasOverflow = maximumScrollLeft > 1;
      viewport.dataset.canScrollLeft = String(hasOverflow && scrollContainer.scrollLeft > 1);
      viewport.dataset.canScrollRight = String(
        hasOverflow && scrollContainer.scrollLeft < maximumScrollLeft - 1,
      );
    };

    const updateLayoutState = (): void => {
      updatePanelWidth();
      updateScrollAffordances();
    };

    const scheduleLayoutUpdate = (): void => {
      if (!view?.requestAnimationFrame) {
        updateLayoutState();
        return;
      }
      if (animationFrame !== null) {
        view.cancelAnimationFrame(animationFrame);
      }
      animationFrame = view.requestAnimationFrame(() => {
        animationFrame = null;
        updateLayoutState();
      });
    };

    const ResizeObserverClass = view?.ResizeObserver;
    const resizeObserver = ResizeObserverClass
      ? new ResizeObserverClass(scheduleLayoutUpdate)
      : null;
    resizeObserver?.observe(scrollContainer);
    if (layoutContainer) {
      resizeObserver?.observe(layoutContainer);
    }
    scrollContainer.addEventListener("scroll", updateScrollAffordances, { passive: true });
    view?.addEventListener("resize", scheduleLayoutUpdate);

    const applyState = (nextState: TableDisplayState, save: boolean): void => {
      state = nextState;
      block.dataset.mode = state.mode;
      block.dataset.density = state.density;
      block.style.setProperty(
        "--rb-table-font-size",
        state.density === "compact" ? "0.7em" : "0.82em",
      );
      block.style.setProperty(
        "--rb-table-line-height",
        state.density === "compact" ? "1.28" : "1.42",
      );
      block.style.setProperty(
        "--rb-table-cell-padding",
        state.density === "compact" ? "0.28em 0.42em" : "0.45em 0.62em",
      );
      fitButton.setAttribute("aria-pressed", String(state.mode === "fit"));
      wideButton.setAttribute("aria-pressed", String(state.mode === "wide"));
      compactButton.setAttribute("aria-pressed", String(state.density === "compact"));
      if (save) {
        options.sessionStates.set(stateKey, state);
      }
      scheduleLayoutUpdate();
    };

    const getFullscreenFocusable = (): HTMLElement[] =>
      Array.from(
        block.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );

    const handleFullscreenKeyDown = (event: KeyboardEvent): void => {
      if (!fullscreen) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFullscreen(true);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFullscreenFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        block.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      const activeElement = getShadowActiveElement(block);
      if (event.shiftKey && (activeElement === first || !block.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !block.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    const openFullscreen = (): void => {
      if (fullscreen) {
        return;
      }
      fullscreen = true;
      fullscreenTrigger = fullscreenButton;
      block.dataset.rbTableFullscreen = "true";
      block.setAttribute("role", "dialog");
      block.setAttribute("aria-modal", "true");
      block.setAttribute("aria-label", `Fullscreen table ${tableIndex + 1}`);
      fullscreenButton.setAttribute("aria-pressed", "true");
      closeButton.hidden = false;
      view?.addEventListener("keydown", handleFullscreenKeyDown, true);
      closeButton.focus();
      scheduleLayoutUpdate();
    };

    function closeFullscreen(restoreFocus: boolean): void {
      if (!fullscreen) {
        return;
      }
      fullscreen = false;
      delete block.dataset.rbTableFullscreen;
      block.removeAttribute("role");
      block.removeAttribute("aria-modal");
      block.removeAttribute("aria-label");
      fullscreenButton.setAttribute("aria-pressed", "false");
      closeButton.hidden = true;
      view?.removeEventListener("keydown", handleFullscreenKeyDown, true);
      if (restoreFocus && fullscreenTrigger?.isConnected) {
        fullscreenTrigger.focus();
      }
      fullscreenTrigger = null;
      scheduleLayoutUpdate();
    }

    const onFit = (): void => applyState({ ...state, mode: "fit" }, true);
    const onWide = (): void => applyState({ ...state, mode: "wide" }, true);
    const onFullscreen = (): void => openFullscreen();
    const onCompact = (): void =>
      applyState({ ...state, density: state.density === "compact" ? "normal" : "compact" }, true);
    const onReset = (): void => {
      closeFullscreen(false);
      options.sessionStates.delete(stateKey);
      applyState(defaultState, false);
    };
    const onClose = (): void => closeFullscreen(true);

    fitButton.addEventListener("click", onFit);
    wideButton.addEventListener("click", onWide);
    fullscreenButton.addEventListener("click", onFullscreen);
    compactButton.addEventListener("click", onCompact);
    resetButton.addEventListener("click", onReset);
    closeButton.addEventListener("click", onClose);
    applyState(state, false);
    fullscreenButton.setAttribute("aria-pressed", "false");
    updateLayoutState();

    enhancedTables.push({
      block,
      table,
      cleanup: () => {
        closeFullscreen(false);
        fitButton.removeEventListener("click", onFit);
        wideButton.removeEventListener("click", onWide);
        fullscreenButton.removeEventListener("click", onFullscreen);
        compactButton.removeEventListener("click", onCompact);
        resetButton.removeEventListener("click", onReset);
        closeButton.removeEventListener("click", onClose);
        scrollContainer.removeEventListener("scroll", updateScrollAffordances);
        view?.removeEventListener("resize", scheduleLayoutUpdate);
        resizeObserver?.disconnect();
        if (animationFrame !== null) {
          view?.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }
        for (const span of longTokenSpans) {
          if (span.isConnected) {
            const parent = span.parentNode;
            span.replaceWith(document.createTextNode(span.textContent ?? ""));
            parent?.normalize();
          }
        }
        if (block.isConnected) {
          block.replaceWith(table);
        }
      },
    });
  });

  return () => {
    for (const enhanced of enhancedTables) {
      enhanced.cleanup();
    }
  };
}
