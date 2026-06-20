import { useSyncExternalStore } from "react";

/**
 * A tiny runtime store holding an optional "brand" color override. When set, the
 * MUI theme's `primary` (and the derived accent family) is rebuilt from it, so
 * the whole app can be re-skinned by changing one color. Defaults to null (ship
 * the Bloom Blue theme).
 *
 * Intentionally in-memory only: the brand is a live, in-session tuning lever for
 * the dev Theme Tuner. We deliberately do NOT read or write localStorage — the
 * app must never skin itself from a leftover experiment on reload. So this resets
 * to null every load.
 *
 * This is intentionally framework-light and dependency-free so the published
 * workspace component can subscribe to it without pulling in any dev-only code.
 */

let current: string | null = null;
const listeners = new Set<() => void>();

export function getBrand(): string | null {
  return current;
}

export function setBrand(value: string | null): void {
  current = value;
  listeners.forEach((l) => l());
}

export function subscribeBrand(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook returning the current brand override (or null). */
export function useBrand(): string | null {
  return useSyncExternalStore(subscribeBrand, getBrand, () => null);
}
