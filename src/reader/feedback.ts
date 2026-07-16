export const FEEDBACK_FORM_URL = "https://tally.so/r/QKWqjp";

export type FeedbackWindowOpener = (url: string, target: string, features: string) => unknown;

export function openFeedbackForm(
  openWindow: FeedbackWindowOpener = (url, target, features) => window.open(url, target, features),
): boolean {
  try {
    openWindow(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
