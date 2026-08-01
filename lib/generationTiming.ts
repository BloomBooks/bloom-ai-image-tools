import { GenerationTimingState } from "../types";

export const DEFAULT_GENERATION_ESTIMATE_MS = 30000;
export const MAX_PROMPT_DURATION_ESTIMATES = 40;
export const MAX_TOOL_DURATION_ESTIMATES = 24;
export const PESSIMISTIC_MS = 3000;

export const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export const clampDurationMs = (value: number | null | undefined) => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return DEFAULT_GENERATION_ESTIMATE_MS;
  }

  return Math.max(1000, Math.min(300000, Math.round(value as number)));
};

export const limitDurationMap = (durationsByKey: Record<string, number>, maxEntries: number) => {
  const entries = Object.entries(durationsByKey);
  if (entries.length <= maxEntries) {
    return durationsByKey;
  }

  return Object.fromEntries(entries.slice(-maxEntries));
};

export const normalizeDurationMap = (
  value: unknown,
  maxEntries: number,
): Record<string, number> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized = Object.entries(value as Record<string, unknown>).reduce<
    Record<string, number>
  >((result, [key, durationMs]) => {
    const cleanKey = key.trim();
    if (!cleanKey || typeof durationMs !== "number" || durationMs <= 0) {
      return result;
    }

    result[cleanKey] = clampDurationMs(durationMs);
    return result;
  }, {});

  return limitDurationMap(normalized, maxEntries);
};

export const normalizeGenerationTiming = (value: unknown): GenerationTimingState => {
  const raw = value as Partial<GenerationTimingState> | null | undefined;

  return {
    lastDurationMs:
      typeof raw?.lastDurationMs === "number" && raw.lastDurationMs > 0
        ? clampDurationMs(raw.lastDurationMs)
        : null,
    promptDurationsByKey: normalizeDurationMap(
      raw?.promptDurationsByKey,
      MAX_PROMPT_DURATION_ESTIMATES,
    ),
    toolDurationsByKey: normalizeDurationMap(raw?.toolDurationsByKey, MAX_TOOL_DURATION_ESTIMATES),
  };
};

export const createPromptDurationKey = (toolId: string, modelId: string, prompt: string) =>
  `${toolId}:${modelId}:${hashString(prompt.trim())}`;

export const createToolDurationKey = (toolId: string, modelId: string) => `${toolId}:${modelId}`;

export const resolveEstimatedDurationMs = (
  timing: GenerationTimingState,
  promptKey: string,
  toolKey: string,
) =>
  (timing.promptDurationsByKey[promptKey] ||
    timing.toolDurationsByKey[toolKey] ||
    timing.lastDurationMs ||
    DEFAULT_GENERATION_ESTIMATE_MS) + PESSIMISTIC_MS;

export const updateGenerationTiming = (
  current: GenerationTimingState,
  promptKey: string,
  toolKey: string,
  durationMs: number,
): GenerationTimingState => {
  const normalizedDurationMs = clampDurationMs(durationMs);
  const previousToolDuration = current.toolDurationsByKey[toolKey];
  const nextToolDuration = previousToolDuration
    ? Math.round(previousToolDuration * 0.65 + normalizedDurationMs * 0.35)
    : normalizedDurationMs;

  return {
    lastDurationMs: normalizedDurationMs,
    promptDurationsByKey: limitDurationMap(
      {
        ...current.promptDurationsByKey,
        [promptKey]: normalizedDurationMs,
      },
      MAX_PROMPT_DURATION_ESTIMATES,
    ),
    toolDurationsByKey: limitDurationMap(
      {
        ...current.toolDurationsByKey,
        [toolKey]: clampDurationMs(nextToolDuration),
      },
      MAX_TOOL_DURATION_ESTIMATES,
    ),
  };
};
