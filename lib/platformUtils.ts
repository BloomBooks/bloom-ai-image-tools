/**
 * Returns true if the current platform appears to be macOS.
 * Useful for adjusting UI conventions (e.g., button order).
 */
export const isMacPlatform = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /mac/i.test(navigator.userAgent || navigator.platform || "");
};
