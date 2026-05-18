import React from "react";

type Listener = () => void;

// ── drag-in-progress flag ──────────────────────────────────────────────────
let isAnyDndDragging = false;
const listeners = new Set<Listener>();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

export const setGlobalDndDragging = (nextValue: boolean) => {
  if (isAnyDndDragging === nextValue) {
    return;
  }

  isAnyDndDragging = nextValue;
  notifyListeners();
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => isAnyDndDragging;

export const useIsAnyDndDragging = () =>
  React.useSyncExternalStore(subscribe, getSnapshot, () => false);

// ── last pointer-down → dragstart latency ─────────────────────────────────
let lastDragDelayMs: number | null = null;
const delayListeners = new Set<Listener>();

export const recordDragDelayMs = (ms: number) => {
  lastDragDelayMs = ms;
  delayListeners.forEach((l) => l());
};

const subscribeDelay = (listener: Listener) => {
  delayListeners.add(listener);
  return () => {
    delayListeners.delete(listener);
  };
};

const getDelaySnapshot = () => lastDragDelayMs;

export const useLastDragDelayMs = () =>
  React.useSyncExternalStore(subscribeDelay, getDelaySnapshot, () => null);
