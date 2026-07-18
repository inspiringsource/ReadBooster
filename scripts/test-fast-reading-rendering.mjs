/* global console, process, window */

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
      rollupOptions: { input: resolve(root, "tests/browser/fast-reading-harness.html") },
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

  console.log(
    JSON.stringify(
      {
        shadowOnlyBeforeFix: shadowOnlyResults,
        fontResponse: fontResponses[0],
        results,
        pixelDifference: { defaultVsFastPixels, contextualAlternatesPixels: alternatesPixels },
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
