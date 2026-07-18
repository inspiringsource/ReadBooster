type ExtensionGlobals = typeof globalThis & {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};

/**
 * Firefox exposes the Promise-first `browser` namespace while Chrome exposes
 * `chrome`. ReadBooster uses only their shared WebExtensions surface.
 */
export function getExtensionApi(): typeof chrome | null {
  const globals = globalThis as ExtensionGlobals;
  return globals.browser ?? globals.chrome ?? null;
}
