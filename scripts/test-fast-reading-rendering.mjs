/* global console, document, getComputedStyle, HTMLButtonElement, HTMLElement, process, requestAnimationFrame, window */

import { createServer } from "node:http";
import { cp, mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

import pixelmatch from "pixelmatch";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { build } from "vite";

const root = process.cwd();
const chromeCandidates = [
  process.env.READBOOSTER_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

async function firstExisting(paths) {
  for (const path of paths) {
    try {
      await stat(path);
      return path;
    } catch {
      // Try the next documented local Chromium installation.
    }
  }
  throw new Error("No local Chrome/Chromium executable was found for test:browser");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function contrastRatio(foreground, background) {
  const channels = (color) => {
    const values = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    assert(values?.length === 3, `Could not parse computed color: ${color}`);
    return values.map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
  };
  const luminance = (color) => {
    const [red, green, blue] = channels(color);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const output = await mkdtemp(join(tmpdir(), "readbooster-fast-reading-"));
let browser;
let server;

try {
  await build({
    configFile: false,
    root: resolve(root, "tests/browser"),
    publicDir: false,
    logLevel: "warn",
    build: {
      emptyOutDir: true,
      outDir: output,
      rollupOptions: {
        input: {
          fastReading: resolve(root, "tests/browser/fast-reading-harness.html"),
          stickerLayout: resolve(root, "tests/browser/sticker-layout-harness.html"),
          stickerNavigation: resolve(root, "tests/browser/sticker-navigation-harness.html"),
        },
      },
    },
  });
  await mkdir(join(output, "fonts"), { recursive: true });
  await cp(resolve(root, "dist/fonts/Fast_Sans.ttf"), join(output, "fonts/Fast_Sans.ttf"));

  server = createServer(async (request, response) => {
    try {
      const requestPath = request.url === "/" ? "/fast-reading-harness.html" : request.url;
      const safePath = normalize(requestPath.split("?")[0]).replace(/^(\.\.(\/|\\|$))+/, "");
      const filePath = join(output, safePath);
      const content = await readFile(filePath);
      const contentTypes = {
        ".css": "text/css",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".ttf": "font/ttf",
      };
      response.writeHead(200, {
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  assert(address && typeof address !== "string", "Browser test server did not start");

  const fontResponses = [];
  browser = await chromium.launch({
    executablePath: await firstExisting(chromeCandidates),
    headless: true,
  });
  const legacyPage = await browser.newPage({
    viewport: { width: 2300, height: 760 },
    deviceScaleFactor: 1,
  });
  await legacyPage.goto(
    `http://127.0.0.1:${address.port}/fast-reading-harness.html?shadow-only=1`,
    { waitUntil: "networkidle" },
  );
  await legacyPage.waitForFunction(() => Boolean(window.__FAST_READING_RESULTS__));
  const shadowOnlyResults = await legacyPage.evaluate(() => window.__FAST_READING_RESULTS__);
  assert(
    shadowOnlyResults.loadedFaceCount === 0,
    "Regression fixture expected the old shadow-only @font-face to load zero document faces",
  );
  await legacyPage.close();

  const page = await browser.newPage({
    viewport: { width: 2300, height: 760 },
    deviceScaleFactor: 1,
  });
  page.on("response", (response) => {
    if (response.url().includes("Fast_Sans.ttf")) {
      fontResponses.push({ status: response.status(), url: response.url() });
    }
  });
  await page.goto(`http://127.0.0.1:${address.port}/fast-reading-harness.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.__FAST_READING_RESULTS__));
  const results = await page.evaluate(() => window.__FAST_READING_RESULTS__);

  const screenshots = {};
  for (const sample of ["default", "fast-without-calt", "fast"]) {
    screenshots[sample] = PNG.sync.read(
      await page
        .locator(`.rb-sample[data-sample="${sample}"]`)
        .screenshot({ animations: "disabled" }),
    );
  }
  const compare = (left, right) => {
    assert(
      left.width === right.width && left.height === right.height,
      "Pixel fixtures differ in size",
    );
    return pixelmatch(left.data, right.data, null, left.width, left.height, { threshold: 0.1 });
  };
  const defaultVsFastPixels = compare(screenshots.default, screenshots.fast);
  const alternatesPixels = compare(screenshots["fast-without-calt"], screenshots.fast);

  const paragraph = results.paragraph;
  assert(results.fontCheck === true, "document.fonts.check did not confirm Fast Sans");
  assert(results.loadedFaceCount > 0, "document.fonts.load returned no Fast Sans faces");
  assert(
    fontResponses.some((response) => response.status === 200),
    "Fast Sans did not load over HTTP 200",
  );
  assert(
    paragraph.fontFamily.includes("ReadBooster Fast Sans"),
    "Reader paragraph uses the wrong family",
  );
  assert(
    paragraph.fontFeatureSettings.includes("calt"),
    "Reader paragraph lacks contextual alternates",
  );
  assert(
    paragraph.fontVariantLigatures === "contextual",
    "Reader paragraph ligatures are not contextual",
  );
  assert(
    results.lastParagraph.fontFamily.includes("ReadBooster Fast Sans"),
    "Dynamic section lost Fast Sans",
  );
  assert(
    results.lastParagraph.fontFeatureSettings.includes("calt"),
    "Dynamic section lost contextual alternates",
  );
  assert(
    results.sectionHeading.fontFamily.includes("ReadBooster Fast Sans"),
    "Section heading lost Fast Sans",
  );
  assert(results.strong.fontFamily.includes("ReadBooster Fast Sans"), "Strong text lost Fast Sans");
  assert(results.strong.fontWeight === "700", "Strong text is not distinguishable at weight 700");
  assert(results.bold.fontFamily.includes("ReadBooster Fast Sans"), "Bold text lost Fast Sans");
  assert(results.bold.fontWeight === "700", "Bold text is not distinguishable at weight 700");
  assert(
    results.focusParagraph.fontFamily.includes("ReadBooster Fast Sans"),
    "Focus mode lost Fast Sans",
  );
  assert(results.focusParagraph.fontFeatureSettings.includes("calt"), "Focus mode lost alternates");
  assert(
    !results.code.fontFamily.includes("ReadBooster Fast Sans"),
    "Code incorrectly uses Fast Sans",
  );
  assert(
    !results.math.fontFamily.includes("ReadBooster Fast Sans"),
    "Math incorrectly uses Fast Sans",
  );
  assert(defaultVsFastPixels > 10_000, "Default and Fast Reading rendered too similarly");
  assert(alternatesPixels > 1_000, "Contextual alternates produced no meaningful pixel difference");

  const layoutPage = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await layoutPage.goto(`http://127.0.0.1:${address.port}/sticker-layout-harness.html`, {
    waitUntil: "networkidle",
  });
  await layoutPage.waitForFunction(() => window.__STICKER_LAYOUT_READY__ === true);

  const measureStickerLayout = async ({
    width,
    outlineOpen,
    fontSize,
    lineHeight,
    textSize,
    spacing,
    appearance = "light",
  }) => {
    await layoutPage.setViewportSize({ width, height: 1080 });
    return layoutPage.evaluate(
      async ({
        nextOutlineOpen,
        nextFontSize,
        nextLineHeight,
        nextTextSize,
        nextSpacing,
        nextAppearance,
      }) => {
        const shadowRoot = document.querySelector("#sticker-layout-harness")?.shadowRoot;
        const readerElement = shadowRoot?.querySelector(".rb-reader");
        const body = shadowRoot?.querySelector(".rb-reader-body");
        const outline = shadowRoot?.querySelector(".rb-outline");
        const layer = shadowRoot?.querySelector(".rb-sticker-layer");
        const content = shadowRoot?.querySelector(".rb-content");
        const expanded = shadowRoot?.querySelector(".rb-sticker--expanded");
        const backdrop = shadowRoot?.querySelector(".rb-sticker-drawer-backdrop");
        const stickerAnchor = shadowRoot?.querySelector(".rb-sticker-anchor");
        const stickerMenu = shadowRoot?.querySelector(".rb-sticker-menu");
        const stickerMenuPortal = shadowRoot?.querySelector(".rb-sticker-menu-portal");
        const collapsed = Array.from(shadowRoot?.querySelectorAll(".rb-sticker--collapsed") ?? []);
        if (
          !(readerElement instanceof HTMLElement) ||
          !(body instanceof HTMLElement) ||
          !(outline instanceof HTMLElement) ||
          !(layer instanceof HTMLElement) ||
          !(content instanceof HTMLElement) ||
          !(expanded instanceof HTMLElement) ||
          !(backdrop instanceof HTMLElement) ||
          !(stickerAnchor instanceof HTMLElement) ||
          !(stickerMenu instanceof HTMLElement) ||
          !(stickerMenuPortal instanceof HTMLElement)
        ) {
          throw new Error("Sticker layout probe is incomplete");
        }
        readerElement.style.setProperty("--rb-font-size", nextFontSize);
        readerElement.style.setProperty("--rb-line-height", nextLineHeight);
        readerElement.dataset.textSize = nextTextSize;
        readerElement.dataset.spacing = nextSpacing;
        readerElement.dataset.appearance = nextAppearance;
        body.dataset.outlineOpen = String(nextOutlineOpen);
        outline.hidden = !nextOutlineOpen;
        await new Promise((resolveFrame) =>
          requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
        );
        window.__POSITION_STICKER_MENU__();

        const contentWidthWithStickers = content.getBoundingClientRect().width;
        layer.style.display = "none";
        const contentWidthWithoutStickers = content.getBoundingClientRect().width;
        layer.style.removeProperty("display");

        const expandedStyle = getComputedStyle(expanded);
        const backdropStyle = getComputedStyle(backdrop);
        const contentRect = content.getBoundingClientRect();
        const expandedRect = expanded.getBoundingClientRect();
        const anchorRect = stickerAnchor.getBoundingClientRect();
        const menuRect = stickerMenu.getBoundingClientRect();
        const menuStyle = getComputedStyle(stickerMenu);
        return {
          viewport: { height: window.innerHeight, width: window.innerWidth },
          contentWidthWithStickers,
          contentWidthWithoutStickers,
          expandedPosition: expandedStyle.position,
          backdropDisplay: backdropStyle.display,
          expandedOverlapsText: expandedRect.left < contentRect.right - 8,
          contentBounds: { left: contentRect.left, right: contentRect.right },
          expandedBounds: { left: expandedRect.left, right: expandedRect.right },
          collapsed: collapsed.map((element) => ({
            top: getComputedStyle(element).top,
            width: element.getBoundingClientRect().width,
            bounds: {
              top: element.getBoundingClientRect().top,
              bottom: element.getBoundingClientRect().bottom,
            },
            hasNoteIcon: element.querySelector("[data-rb-sticker-note-icon]") !== null,
          })),
          anchorBottom: anchorRect.bottom,
          menu: {
            appearance: nextAppearance,
            backgroundColor: menuStyle.backgroundColor,
            textColor: menuStyle.color,
            actionLabels: Array.from(stickerMenu.querySelectorAll('[role="menuitem"]'), (item) =>
              item.textContent?.trim(),
            ),
            actionStyles: Array.from(stickerMenu.querySelectorAll('[role="menuitem"]'), (item) => {
              const style = getComputedStyle(item);
              return {
                color: style.color,
                disabled: item.disabled,
                opacity: style.opacity,
                textFillColor: style.webkitTextFillColor,
              };
            }),
            actionHeights: Array.from(
              stickerMenu.querySelectorAll('[role="menuitem"]'),
              (item) => item.getBoundingClientRect().height,
            ),
            bounds: {
              bottom: menuRect.bottom,
              left: menuRect.left,
              right: menuRect.right,
              top: menuRect.top,
            },
            outsideCard: !expanded.contains(stickerMenu),
            placement: stickerMenu.dataset.placement,
            portalParentIsReader: stickerMenuPortal.parentElement === readerElement,
          },
        };
      },
      {
        nextOutlineOpen: outlineOpen,
        nextFontSize: fontSize,
        nextLineHeight: lineHeight,
        nextTextSize: textSize,
        nextSpacing: spacing,
        nextAppearance: appearance,
      },
    );
  };

  const stickerLayouts = {
    wideOutlineHidden: await measureStickerLayout({
      width: 1920,
      outlineOpen: false,
      fontSize: "19px",
      lineHeight: "1.72",
      textSize: "medium",
      spacing: "comfortable",
    }),
    wideOutlineVisible: await measureStickerLayout({
      width: 1920,
      outlineOpen: true,
      fontSize: "19px",
      lineHeight: "1.72",
      textSize: "medium",
      spacing: "comfortable",
    }),
    largeTextOutlineVisible: await measureStickerLayout({
      width: 1920,
      outlineOpen: true,
      fontSize: "24px",
      lineHeight: "1.9",
      textSize: "x-large",
      spacing: "roomy",
    }),
    constrainedOutlineVisible: await measureStickerLayout({
      width: 1400,
      outlineOpen: true,
      fontSize: "17px",
      lineHeight: "1.55",
      textSize: "small",
      spacing: "compact",
    }),
    narrow: await measureStickerLayout({
      width: 720,
      outlineOpen: false,
      fontSize: "24px",
      lineHeight: "1.9",
      textSize: "x-large",
      spacing: "roomy",
    }),
    dark: await measureStickerLayout({
      width: 1920,
      outlineOpen: false,
      fontSize: "19px",
      lineHeight: "1.72",
      textSize: "medium",
      spacing: "comfortable",
      appearance: "dark",
    }),
  };
  for (const [name, layout] of Object.entries(stickerLayouts)) {
    assert(
      Math.abs(layout.contentWidthWithStickers - layout.contentWidthWithoutStickers) < 0.5,
      `${name}: Stickers changed the primary reading-column width`,
    );
    assert(layout.collapsed.length === 2, `${name}: collapsed pins are missing`);
    assert(
      layout.collapsed.every((pin) => pin.width === 40),
      `${name}: collapsed pins are not compact`,
    );
    assert(
      layout.collapsed[0].bounds.top >= layout.anchorBottom + 16,
      `${name}: first pin overlaps the Add sticker control`,
    );
    assert(
      layout.collapsed[1].bounds.top - layout.collapsed[0].bounds.bottom >= 8,
      `${name}: collapsed pins are not vertically stacked`,
    );
    assert(
      layout.collapsed.every((pin) => pin.hasNoteIcon),
      `${name}: collapsed pins do not expose the note icon`,
    );
    assert(
      JSON.stringify(layout.menu.actionLabels) ===
        JSON.stringify(["Edit", "Collapse", "Unpin", "Delete"]),
      `${name}: Sticker menu does not expose all four actions`,
    );
    assert(
      layout.menu.actionHeights.every((height) => height >= 38),
      `${name}: Sticker menu rows are too short`,
    );
    assert(
      layout.menu.actionStyles.every(
        (style) =>
          style.disabled === false && style.opacity === "1" && style.textFillColor === style.color,
      ),
      `${name}: Sticker menu actions look disabled or lost their explicit foreground`,
    );
    assert(
      layout.menu.actionStyles.slice(0, 3).every((style) => style.color === layout.menu.textColor),
      `${name}: Normal Sticker actions do not use the Reader foreground token`,
    );
    assert(
      layout.menu.actionStyles[3].color !== layout.menu.textColor,
      `${name}: Delete lost its distinct destructive foreground`,
    );
    assert(
      layout.menu.actionStyles.every(
        (style) => contrastRatio(style.color, layout.menu.backgroundColor) >= 4.5,
      ),
      `${name}: Sticker menu action contrast is below 4.5:1`,
    );
    assert(layout.menu.outsideCard, `${name}: Sticker menu is still contained by the card`);
    assert(layout.menu.portalParentIsReader, `${name}: Sticker menu portal left the Reader root`);
    assert(
      layout.menu.bounds.left >= 8 &&
        layout.menu.bounds.right <= layout.viewport.width - 8 &&
        layout.menu.bounds.top >= 8 &&
        layout.menu.bounds.bottom <= layout.viewport.height - 8,
      `${name}: Sticker menu extends beyond the viewport`,
    );
  }
  assert(
    stickerLayouts.wideOutlineHidden.expandedPosition === "absolute" &&
      stickerLayouts.wideOutlineHidden.backdropDisplay === "none",
    "Wide layout did not use a floating section card",
  );
  assert(
    stickerLayouts.wideOutlineHidden.expandedOverlapsText === false,
    `Wide floating Sticker covered the primary text: ${JSON.stringify(stickerLayouts.wideOutlineHidden)}`,
  );
  assert(
    stickerLayouts.wideOutlineVisible.expandedPosition === "absolute" &&
      stickerLayouts.wideOutlineVisible.expandedOverlapsText === false,
    "Wide layout with the outline visible did not keep its card in the margin",
  );
  for (const name of ["largeTextOutlineVisible", "constrainedOutlineVisible", "narrow"]) {
    assert(
      stickerLayouts[name].expandedPosition === "fixed" &&
        stickerLayouts[name].backdropDisplay !== "none",
      `${name}: constrained layout did not use the temporary drawer`,
    );
  }
  const editMenuItem = layoutPage.locator(".rb-sticker-menu-item").first();
  const readInteractiveMenuStyle = () =>
    layoutPage.evaluate(() => {
      const shadowRoot = document.querySelector("#sticker-layout-harness")?.shadowRoot;
      const item = shadowRoot?.querySelector(".rb-sticker-menu-item");
      const menu = shadowRoot?.querySelector(".rb-sticker-menu");
      if (!(item instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
        throw new Error("Sticker menu interaction probe is incomplete");
      }
      const itemStyle = getComputedStyle(item);
      const menuStyle = getComputedStyle(menu);
      return {
        color: itemStyle.color,
        backgroundColor:
          itemStyle.backgroundColor === "rgba(0, 0, 0, 0)"
            ? menuStyle.backgroundColor
            : itemStyle.backgroundColor,
      };
    });
  await editMenuItem.hover();
  const hoverMenuStyle = await readInteractiveMenuStyle();
  await editMenuItem.focus();
  const focusMenuStyle = await readInteractiveMenuStyle();
  await editMenuItem.hover();
  await layoutPage.mouse.down();
  const activeMenuStyle = await readInteractiveMenuStyle();
  await layoutPage.mouse.up();
  for (const [state, style] of Object.entries({
    hover: hoverMenuStyle,
    focus: focusMenuStyle,
    active: activeMenuStyle,
  })) {
    assert(
      contrastRatio(style.color, style.backgroundColor) >= 4.5,
      `Sticker menu ${state} contrast is below 4.5:1`,
    );
  }
  const flippedMenu = await layoutPage.evaluate(async () => {
    const shadowRoot = document.querySelector("#sticker-layout-harness")?.shadowRoot;
    const expanded = shadowRoot?.querySelector(".rb-sticker--expanded");
    const menu = shadowRoot?.querySelector(".rb-sticker-menu");
    if (!(expanded instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
      throw new Error("Sticker menu flip probe is incomplete");
    }
    expanded.style.setProperty("top", "calc(100dvh - 48px)", "important");
    expanded.style.setProperty("transform", "none", "important");
    window.__POSITION_STICKER_MENU__();
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const bounds = menu.getBoundingClientRect();
    return {
      placement: menu.dataset.placement,
      bounds: { top: bounds.top, bottom: bounds.bottom },
      viewportHeight: window.innerHeight,
    };
  });
  assert(
    flippedMenu.placement === "above",
    "Sticker menu did not flip above near the viewport bottom",
  );
  assert(
    flippedMenu.bounds.top >= 8 && flippedMenu.bounds.bottom <= flippedMenu.viewportHeight - 8,
    "Upward-flipped Sticker menu extends beyond the viewport",
  );
  await layoutPage.close();

  const navigationPage = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await navigationPage.goto(`http://127.0.0.1:${address.port}/sticker-navigation-harness.html`, {
    waitUntil: "networkidle",
  });
  await navigationPage.waitForFunction(() => window.__STICKER_NAVIGATION_READY__ === true);
  const initialNavigation = await navigationPage.evaluate(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const content = shadowRoot?.querySelector(".rb-content");
    const navigation = shadowRoot?.querySelector(".rb-sticker-navigation");
    const above = shadowRoot?.querySelector('[data-rb-sticker-navigation="above"]');
    const below = shadowRoot?.querySelector('[data-rb-sticker-navigation="below"]');
    if (
      !(content instanceof HTMLElement) ||
      !(navigation instanceof HTMLElement) ||
      !(above instanceof HTMLButtonElement) ||
      !(below instanceof HTMLButtonElement)
    ) {
      throw new Error("Sticker navigation browser probe is incomplete");
    }
    const contentWidthWithNavigation = content.getBoundingClientRect().width;
    navigation.style.display = "none";
    const contentWidthWithoutNavigation = content.getBoundingClientRect().width;
    navigation.style.removeProperty("display");
    const navigationBounds = navigation.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    return {
      aboveCount: above.textContent?.trim(),
      belowCount: below.textContent?.trim(),
      aboveLabel: above.getAttribute("aria-label"),
      belowLabel: below.getAttribute("aria-label"),
      contentWidthWithNavigation,
      contentWidthWithoutNavigation,
      overlapsReadingContent: navigationBounds.left < contentBounds.right,
    };
  });
  assert(initialNavigation.aboveCount === "↑1", "Initial Sticker-above count is incorrect");
  assert(initialNavigation.belowCount === "↓2", "Initial Sticker-below count is incorrect");
  assert(
    initialNavigation.aboveLabel?.includes("nearest Sticker above") &&
      initialNavigation.belowLabel?.includes("nearest Sticker below"),
    "Sticker navigation lacks directional accessible labels",
  );
  assert(
    Math.abs(
      initialNavigation.contentWidthWithNavigation -
        initialNavigation.contentWidthWithoutNavigation,
    ) < 0.5,
    "Sticker navigation changed the primary reading width",
  );
  assert(
    initialNavigation.overlapsReadingContent === false,
    "Sticker navigation overlaps the primary reading content in the wide layout",
  );

  const outlinedNavigation = await navigationPage.evaluate(async () => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const body = shadowRoot?.querySelector(".rb-reader-body");
    const outline = shadowRoot?.querySelector(".rb-outline");
    const content = shadowRoot?.querySelector(".rb-content");
    const navigation = shadowRoot?.querySelector(".rb-sticker-navigation");
    if (
      !(body instanceof HTMLElement) ||
      !(outline instanceof HTMLElement) ||
      !(content instanceof HTMLElement) ||
      !(navigation instanceof HTMLElement)
    ) {
      throw new Error("Outlined Sticker navigation probe is incomplete");
    }
    body.dataset.outlineOpen = "true";
    outline.hidden = false;
    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
    );
    const contentWidthWithNavigation = content.getBoundingClientRect().width;
    navigation.style.display = "none";
    const contentWidthWithoutNavigation = content.getBoundingClientRect().width;
    navigation.style.removeProperty("display");
    const overlapsReadingContent =
      navigation.getBoundingClientRect().left < content.getBoundingClientRect().right;
    body.dataset.outlineOpen = "false";
    outline.hidden = true;
    return {
      contentWidthWithNavigation,
      contentWidthWithoutNavigation,
      overlapsReadingContent,
    };
  });
  assert(
    Math.abs(
      outlinedNavigation.contentWidthWithNavigation -
        outlinedNavigation.contentWidthWithoutNavigation,
    ) < 0.5,
    "Sticker navigation changed the reading width while the outline was visible",
  );
  assert(
    outlinedNavigation.overlapsReadingContent === false,
    "Sticker navigation overlaps the reading content while the outline is visible",
  );

  await navigationPage.evaluate(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const below = shadowRoot?.querySelector('[data-rb-sticker-navigation="below"]');
    if (below instanceof HTMLButtonElement) {
      below.click();
    }
  });
  await navigationPage.waitForFunction(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const destination = shadowRoot?.querySelector('[data-rb-sticker-id="sticker-3"]');
    return (
      destination instanceof HTMLElement && destination.dataset.rbStickerHighlighted === "true"
    );
  });
  await navigationPage.waitForFunction(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    return (
      shadowRoot?.querySelector('[data-rb-sticker-navigation="below"]')?.textContent?.trim() ===
      "↓1"
    );
  });
  const firstNavigation = await navigationPage.evaluate(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const highlighted = shadowRoot?.querySelector('[data-rb-sticker-highlighted="true"]');
    return {
      highlightedStickerId:
        highlighted instanceof HTMLElement ? highlighted.dataset.rbStickerId : undefined,
      aboveCount: shadowRoot
        ?.querySelector('[data-rb-sticker-navigation="above"]')
        ?.textContent?.trim(),
      belowCount: shadowRoot
        ?.querySelector('[data-rb-sticker-navigation="below"]')
        ?.textContent?.trim(),
    };
  });
  assert(
    firstNavigation.highlightedStickerId === "sticker-3" &&
      firstNavigation.aboveCount === "↑2" &&
      firstNavigation.belowCount === "↓1",
    "First repeated Sticker navigation step did not advance to the nearest destination",
  );
  await navigationPage.evaluate(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const below = shadowRoot?.querySelector('[data-rb-sticker-navigation="below"]');
    if (below instanceof HTMLButtonElement) {
      below.click();
    }
  });
  await navigationPage.waitForFunction(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const destination = shadowRoot?.querySelector('[data-rb-sticker-id="sticker-4"]');
    return (
      destination instanceof HTMLElement && destination.dataset.rbStickerHighlighted === "true"
    );
  });
  await navigationPage.waitForFunction(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    return shadowRoot?.querySelector('[data-rb-sticker-navigation="below"]') === null;
  });
  const navigated = await navigationPage.evaluate(() => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    const scrollArea = shadowRoot?.querySelector(".rb-scroll-area");
    const highlighted = shadowRoot?.querySelector('[data-rb-sticker-highlighted="true"]');
    const above = shadowRoot?.querySelector('[data-rb-sticker-navigation="above"]');
    return {
      highlightedStickerId:
        highlighted instanceof HTMLElement ? highlighted.dataset.rbStickerId : undefined,
      aboveCount: above?.textContent?.trim(),
      hasBelowControl: shadowRoot?.querySelector('[data-rb-sticker-navigation="below"]') !== null,
      scrollTop: scrollArea instanceof HTMLElement ? scrollArea.scrollTop : 0,
      scrollBehavior: window.__STICKER_NAVIGATION_SCROLL_BEHAVIOR__,
    };
  });
  assert(
    navigated.highlightedStickerId === "sticker-4",
    "Sticker navigation highlighted the wrong destination",
  );
  assert(navigated.scrollTop > 0, "Sticker navigation did not scroll the Reader container");
  assert(navigated.hasBelowControl === false, "Down control remained after the last Sticker");
  assert(navigated.aboveCount === "↑3", "Counts did not update after Sticker navigation");
  assert(
    navigated.scrollBehavior === "auto",
    "Reduced-motion navigation did not disable smooth scrolling",
  );
  await navigationPage.setViewportSize({ width: 720, height: 900 });
  const narrowNavigation = await navigationPage.evaluate(async () => {
    const shadowRoot = document.querySelector("#sticker-navigation-harness")?.shadowRoot;
    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
    );
    const content = shadowRoot?.querySelector(".rb-content");
    const navigation = shadowRoot?.querySelector(".rb-sticker-navigation");
    if (!(content instanceof HTMLElement) || !(navigation instanceof HTMLElement)) {
      throw new Error("Narrow Sticker navigation probe is incomplete");
    }
    const contentWidthWithNavigation = content.getBoundingClientRect().width;
    navigation.style.display = "none";
    const contentWidthWithoutNavigation = content.getBoundingClientRect().width;
    navigation.style.removeProperty("display");
    const bounds = navigation.getBoundingClientRect();
    return {
      contentWidthWithNavigation,
      contentWidthWithoutNavigation,
      bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  assert(
    Math.abs(
      narrowNavigation.contentWidthWithNavigation - narrowNavigation.contentWidthWithoutNavigation,
    ) < 0.5,
    "Narrow Sticker navigation changed the primary reading width",
  );
  assert(
    narrowNavigation.bounds.left >= 0 &&
      narrowNavigation.bounds.right <= narrowNavigation.viewport.width &&
      narrowNavigation.bounds.top >= 0 &&
      narrowNavigation.bounds.bottom <= narrowNavigation.viewport.height,
    "Narrow Sticker navigation extends beyond the Reader viewport",
  );
  await navigationPage.close();

  console.log(
    JSON.stringify(
      {
        shadowOnlyBeforeFix: shadowOnlyResults,
        fontResponse: fontResponses[0],
        results,
        pixelDifference: { defaultVsFastPixels, contextualAlternatesPixels: alternatesPixels },
        stickerLayouts,
        stickerNavigation: {
          initial: initialNavigation,
          outlined: outlinedNavigation,
          firstNavigation,
          navigated,
          narrow: narrowNavigation,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolveClose) => (server ? server.close(resolveClose) : resolveClose()));
  await rm(output, { recursive: true, force: true });
}
