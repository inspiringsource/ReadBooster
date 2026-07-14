import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { unmountReader } from "../src/reader/mountReader";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  unmountReader();
  cleanup();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});
