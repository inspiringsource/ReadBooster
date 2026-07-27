import {
  CONTROL_HOST_ID,
  injectOptimizeButton,
  requestOptimizeButtonLayout,
} from "../../src/content/injectButton";

declare global {
  interface Window {
    __OPTIMIZE_CONTROL_HARNESS__: {
      activationCount: () => number;
      controlHost: () => HTMLElement | null;
      requestLayout: () => void;
      setComposerRight: (right: number) => void;
    };
  }
}

let activationCount = 0;
injectOptimizeButton(document, async () => {
  activationCount += 1;
  return { ok: true };
});

window.__OPTIMIZE_CONTROL_HARNESS__ = {
  activationCount: () => activationCount,
  controlHost: () => document.getElementById(CONTROL_HOST_ID),
  requestLayout: () => requestOptimizeButtonLayout(document),
  setComposerRight: (right) => {
    document.documentElement.style.setProperty("--composer-right", `${right}px`);
    requestOptimizeButtonLayout(document);
  },
};
