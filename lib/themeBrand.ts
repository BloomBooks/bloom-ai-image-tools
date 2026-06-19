import { useSyncExternalStore } from "react";

/**
 * A tiny runtime store holding an optional "brand" color override. When set, the
 * MUI theme's `primary` (and the derived accent family) is rebuilt from it, so
 * the whole app can be re-skinned by changing one color. Persisted to
 * localStorage so it survives reloads. Defaults to null (ship the gold theme).
 *
 * This is intentionally framework-light and dependency-free so the published
 * workspace component can subscribe to it without pulling in any dev-only code.
 */

const STORAGE_KEY = "bloom.themeTuner.brand";

function readInitial(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

let current: string | null = readInitial();
const listeners = new Set<() => void>();

export function getBrand(): string | null {
  return current;
}

export function setBrand(value: string | null): void {
  current = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private-mode errors */
  }
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
