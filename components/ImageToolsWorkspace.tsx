import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  Box,
  Button,
  CssBaseline,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { keyframes } from "@emotion/react";
import {
  AppState,
  GenerationProgressState,
  GenerationTimingState,
  ImageRecord,
  ImageToolsStatePersistence,
  ModelReasoningLevel,
  ModelReasoningLevelByModelId,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
  ToolParamsById,
} from "../types";
import { ImageToolsBar } from "./ImageToolsBar";
import {
  editImage,
  fetchOpenRouterCredits,
  OpenRouterApiError,
  OPENROUTER_KEYS_URL,
  OpenRouterCredits,
  ImageConfig,
} from "../services/openRouterService";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";
import { darkTheme } from "./materialUITheme";
import { handleOAuthCallback, initiateOAuthFlow } from "../lib/openRouterOAuth";
import { DEFAULT_MODEL, MODEL_CATALOG } from "../lib/modelsCatalog";
import { ModelChooserDialog } from "./ModelChooserDialog";
import { OpenRouterCreditsHeader } from "./OpenRouterCreditsHeader";
import { AIImageToolsSettingsDialog } from "./AIImageToolsSettingsDialog";
import { Icon, Icons } from "./Icons";
import bloomLogo from "../assets/bloom.svg";
import {
  createToolParamDefaults,
  mergeParamsWithDefaults,
} from "./tools/toolParams";
import {
  API_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
} from "../lib/authStorage";
import { IMAGE_TOOLS_STATE_VERSION } from "../services/persistence/constants";
import { useHistoryStore } from "../services/history/useHistoryStore";
import {
  getStyleIdFromParams,
  getStyleIdFromImageRecord,
} from "../lib/artStyles";
import {
  getImageDimensions,
  getMimeTypeFromUrl,
  prepareImageBlob,
} from "../lib/imageUtils";
import {
  getReferenceConstraints,
  getToolReferenceMode,
} from "../lib/toolHelpers";
import { formatCreditsValue, formatSourceSummary } from "../lib/formatters";
import { removeBackgroundFromImage } from "../lib/backgroundRemoval.ts";
import { createAnimatedGif } from "../lib/animatedGif";
import { applyPostProcessingPipeline } from "../lib/postProcessing";
import { extractDerivedImageItems } from "../lib/toolDerivedResults";
import {
  addItemToStrip,
  createDefaultThumbnailStripsSnapshot,
  hydrateThumbnailStripsSnapshot,
  mergeThumbnailStripsSnapshots,
  removeItemFromStrip,
  reorderItemInStrip,
  replaceStripItems,
  setActiveStrip,
  setStripPinState,
  THUMBNAIL_STRIP_CONFIGS,
  THUMBNAIL_STRIP_ORDER,
  resolveThumbnailStripConfigs,
  ThumbnailStripConfig,
} from "../lib/thumbnailStrips";

// Helper to create UUIDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// MODEL_CATALOG + DEFAULT_MODEL come from lib/modelsCatalog.

const rotate360 = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const renderLinkWithUrl = (url: string) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    style={{ color: "inherit", textDecoration: "underline" }}
  >
    {url}
  </a>
);

const linkifyMessageWithUrl = (
  message: string,
  url: string,
): React.ReactNode => {
  if (!message) {
    return renderLinkWithUrl(url);
  }

  if (!message.includes(url)) {
    return (
      <>
        {message} {renderLinkWithUrl(url)}
      </>
    );
  }

  const parts = message.split(url);
  return parts.map((part, index) => (
    <React.Fragment key={`openrouter-credit-message-${index}`}>
      {part}
      {index < parts.length - 1 && renderLinkWithUrl(url)}
    </React.Fragment>
  ));
};

const buildInsufficientCreditsError = (
  message: string,
  url: string,
): React.ReactNode => {
  const safeMessage = message?.trim() || "This request requires more credits.";
  return <>OpenRouter said "{linkifyMessageWithUrl(safeMessage, url)}"</>;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const MODEL_REASONING_LEVEL_VALUES: ModelReasoningLevel[] = [
  "default",
  "none",
  "low",
  "medium",
  "high",
];

const DEFAULT_GENERATION_ESTIMATE_MS = 30000;
const MAX_PROMPT_DURATION_ESTIMATES = 40;
const MAX_TOOL_DURATION_ESTIMATES = 24;
const PESSIMISTIC_MS = 3000;

const getNowMs = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const clampDurationMs = (value: number | null | undefined) => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return DEFAULT_GENERATION_ESTIMATE_MS;
  }

  return Math.max(1000, Math.min(300000, Math.round(value as number)));
};

const limitDurationMap = (
  durationsByKey: Record<string, number>,
  maxEntries: number,
) => {
  const entries = Object.entries(durationsByKey);
  if (entries.length <= maxEntries) {
    return durationsByKey;
  }

  return Object.fromEntries(entries.slice(-maxEntries));
};

const normalizeDurationMap = (
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

const normalizeGenerationTiming = (value: unknown): GenerationTimingState => {
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
    toolDurationsByKey: normalizeDurationMap(
      raw?.toolDurationsByKey,
      MAX_TOOL_DURATION_ESTIMATES,
    ),
  };
};

const createPromptDurationKey = (
  toolId: string,
  modelId: string,
  prompt: string,
) => `${toolId}:${modelId}:${hashString(prompt.trim())}`;

const createToolDurationKey = (toolId: string, modelId: string) =>
  `${toolId}:${modelId}`;

const resolveEstimatedDurationMs = (
  timing: GenerationTimingState,
  promptKey: string,
  toolKey: string,
) =>
  (timing.promptDurationsByKey[promptKey] ||
    timing.toolDurationsByKey[toolKey] ||
    timing.lastDurationMs ||
    DEFAULT_GENERATION_ESTIMATE_MS) + PESSIMISTIC_MS;

const updateGenerationTiming = (
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

const isModelReasoningLevel = (
  value: unknown,
): value is ModelReasoningLevel => {
  return (
    typeof value === "string" &&
    MODEL_REASONING_LEVEL_VALUES.includes(value as ModelReasoningLevel)
  );
};

const normalizeModelReasoningLevels = (
  value: unknown,
): ModelReasoningLevelByModelId => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: ModelReasoningLevelByModelId = {};
  Object.entries(value as Record<string, unknown>).forEach(
    ([modelId, level]) => {
      const cleanModelId = modelId.trim();
      if (!cleanModelId || !isModelReasoningLevel(level)) {
        return;
      }

      normalized[cleanModelId] = level;
    },
  );

  return normalized;
};

const buildEnvironmentEntry = (url: string, index: number): ImageRecord => ({
  id: `env-${index}-${hashString(url)}`,
  parentId: null,
  imageData: url,
  imageFileName: null,
  toolId: "environment",
  parameters: {},
  sourceStyleId: null,
  durationMs: 0,
  cost: 0,
  model: "",
  timestamp: 0,
  promptUsed: "Environment Image",
  sourceSummary: "Environment",
  resolution: undefined,
  isStarred: false,
  origin: "environment",
});

export interface ImageToolsWorkspaceProps {
  persistence: ImageToolsStatePersistence;
  envApiKey?: string | null;
  environmentImageUrls?: string[];
  environmentStripMode?: "host" | "editable";
  thumbnailStripConfigOverrides?: Partial<
    Record<ThumbnailStripId, Partial<Omit<ThumbnailStripConfig, "id">>>
  >;
}

type WorkspaceState = Omit<AppState, "history">;

export function ImageToolsWorkspace({
  persistence,
  envApiKey: envApiKeyProp = "",
  environmentImageUrls = [],
  environmentStripMode = "host",
  thumbnailStripConfigOverrides,
}: ImageToolsWorkspaceProps) {
  const historyStore = useHistoryStore();

  const [state, setState] = useState<WorkspaceState>({
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: null,
    isProcessing: false,
    isAuthenticated: false,
    error: null,
  });
  const [thumbnailStrips, setThumbnailStrips] =
    useState<ThumbnailStripsSnapshot>(() =>
      createDefaultThumbnailStripsSnapshot(),
    );

  const resolvedThumbnailStripConfigs = useMemo(
    () => resolveThumbnailStripConfigs(thumbnailStripConfigOverrides),
    [thumbnailStripConfigOverrides],
  );

  const [paramsByTool, setParamsByTool] = useState<ToolParamsById>(() =>
    createToolParamDefaults(),
  );
  const [selectedArtStyleId, setSelectedArtStyleId] = useState<string | null>(
    null,
  );
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"oauth" | "manual" | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    DEFAULT_MODEL?.id || "",
  );
  const [generationTiming, setGenerationTiming] =
    useState<GenerationTimingState>({
      lastDurationMs: null,
      promptDurationsByKey: {},
      toolDurationsByKey: {},
    });
  const [generationProgress, setGenerationProgress] =
    useState<GenerationProgressState | null>(null);
  const [resultImageIds, setResultImageIds] = useState<string[]>([]);
  const [modelReasoningLevels, setModelReasoningLevels] =
    useState<ModelReasoningLevelByModelId>({});
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [credits, setCredits] = useState<OpenRouterCredits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [connectCtaAttentionKey, setConnectCtaAttentionKey] = useState(0);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsError, setFsError] = useState<string | null>(null);
  const fsSupported = historyStore.folderSupported;
  const isFolderPersistenceActive = historyStore.folderStatus === "attached";
  const folderName = historyStore.folderName;
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const creditsRequestAbortControllerRef = useRef<AbortController | null>(null);
  const selectedModel =
    MODEL_CATALOG.find((model) => model.id === selectedModelId) ||
    DEFAULT_MODEL;
  const envApiKey = envApiKeyProp?.trim() || "";
  const effectiveApiKey = apiKey || envApiKey;
  const usingEnvKey = !!(envApiKey && !apiKey);
  const resolvedEnvironmentEntries = useMemo(() => {
    return environmentImageUrls
      .map((url, index) => ({ url: url?.trim(), index }))
      .filter(({ url }) => Boolean(url))
      .map(({ url, index }) => buildEnvironmentEntry(url as string, index));
  }, [environmentImageUrls]);

  // The unified history list: user images from the HistoryStore plus the
  // host-provided environment images. Environment items live in memory only
  // and never get written to the folder.
  const combinedHistory = useMemo<ImageRecord[]>(
    () => [...historyStore.history, ...resolvedEnvironmentEntries],
    [historyStore.history, resolvedEnvironmentEntries],
  );

  // For child components that expect the legacy `AppState` shape with a
  // `history` field, materialize one. (Internally we keep `state` slim.)
  const appStateForChildren: AppState = useMemo(
    () => ({ ...state, history: combinedHistory }),
    [state, combinedHistory],
  );
  const openRouterStatusLabel = state.isAuthenticated
    ? usingEnvKey
      ? "OpenRouter key supplied by environment"
      : authMethod === "oauth"
        ? "OpenRouter connected via OAuth"
        : "OpenRouter API key linked"
    : "OpenRouter not connected";
  const historyStatusLabel = isFolderPersistenceActive
    ? `History syncing to ${folderName || "linked folder"}`
    : "History stored in browser only";
  const settingsButtonTitle = `${openRouterStatusLabel}. ${historyStatusLabel}.`;
  const settingsButtonLabel = `Settings • ${openRouterStatusLabel}; ${historyStatusLabel}`;

  const appendHistoryEntry = useCallback(
    async (entry: ImageRecord, options?: { skipHistoryStrip?: boolean }) => {
      const { skipHistoryStrip = false } = options || {};
      await historyStore.addImage(entry);
      if (!skipHistoryStrip) {
        // Keep the history strip ordered newest-first (leftmost).
        setThumbnailStrips((prev) =>
          addItemToStrip(prev, "history", entry.id, 0),
        );
      }
    },
    [historyStore],
  );

  const updateAllArtStyleParams = useCallback(
    (styleId: string) => {
      setParamsByTool((prev) => {
        let mutated = false;
        const next: ToolParamsById = { ...prev };

        TOOLS.forEach((tool) => {
          const artStyleParams = tool.parameters.filter(
            (param) => param.type === "art-style",
          );
          if (!artStyleParams.length) {
            return;
          }

          const currentParams = prev[tool.id] || {};
          const updatedParams = { ...currentParams };
          let toolChanged = false;

          artStyleParams.forEach((param) => {
            if (updatedParams[param.name] !== styleId) {
              updatedParams[param.name] = styleId;
              toolChanged = true;
            }
          });

          const hadEntry = Object.prototype.hasOwnProperty.call(prev, tool.id);
          if (toolChanged || !hadEntry) {
            next[tool.id] = updatedParams;
            mutated = true;
          }
        });

        return mutated ? next : prev;
      });
    },
    [setParamsByTool],
  );

  const handleArtStyleChange = useCallback(
    (styleId: string) => {
      const normalized = styleId.trim();
      if (!normalized.length) {
        setSelectedArtStyleId(null);
        return;
      }
      setSelectedArtStyleId(normalized);
      updateAllArtStyleParams(normalized);
    },
    [updateAllArtStyleParams],
  );

  useEffect(() => {
    const resolvedIds = resolvedEnvironmentEntries.map((entry) => entry.id);

    if (environmentStripMode === "host") {
      setThumbnailStrips((prev) =>
        replaceStripItems(prev, "environment", resolvedIds),
      );
      return;
    }

    // editable mode: seed the strip once if it's empty (don't overwrite once
    // the user has started editing it).
    if (!isHydrated) return;
    if (!resolvedIds.length) return;
    setThumbnailStrips((prev) => {
      const current = prev.itemIdsByStrip.environment || [];
      if (current.length) return prev;
      return replaceStripItems(prev, "environment", resolvedIds);
    });
  }, [resolvedEnvironmentEntries, environmentStripMode, isHydrated]);

  // Drop dangling target/reference/right-panel pointers when their referenced
  // entries are gone from the store. (No longer deletes orphan entries — that
  // was the broken multi-tab behavior; deletion is now explicit via the strip
  // remove handler, which writes a tombstone via the history store.) Skipped
  // until the store finishes hydrating so we don't wipe a persisted target ID
  // before its image has had a chance to load.
  useEffect(() => {
    if (!historyStore.hydrated) return;
    const ids = new Set(historyStore.history.map((e) => e.id));
    const envIds = new Set(resolvedEnvironmentEntries.map((e) => e.id));
    const isValid = (id: string | null) =>
      !!id && (ids.has(id) || envIds.has(id));

    setState((prev) => {
      const referenceImageIds = prev.referenceImageIds.filter(isValid);
      const next: WorkspaceState = {
        ...prev,
        referenceImageIds,
        targetImageId: isValid(prev.targetImageId) ? prev.targetImageId : null,
        rightPanelImageId: isValid(prev.rightPanelImageId)
          ? prev.rightPanelImageId
          : null,
      };
      if (
        next.targetImageId === prev.targetImageId &&
        next.rightPanelImageId === prev.rightPanelImageId &&
        next.referenceImageIds.length === prev.referenceImageIds.length
      ) {
        return prev;
      }
      return next;
    });
  }, [historyStore.hydrated, historyStore.history, resolvedEnvironmentEntries]);

  const refreshCredits = useCallback(async () => {
    if (creditsRequestAbortControllerRef.current) {
      creditsRequestAbortControllerRef.current.abort();
      creditsRequestAbortControllerRef.current = null;
    }

    if (!effectiveApiKey) {
      setCredits(null);
      setCreditsError(null);
      setCreditsLoading(false);
      return;
    }

    const controller = new AbortController();
    creditsRequestAbortControllerRef.current = controller;
    setCreditsLoading(true);
    setCreditsError(null);

    try {
      const result = await fetchOpenRouterCredits(effectiveApiKey, {
        signal: controller.signal,
      });
      setCredits(result);
    } catch (error) {
      const isAbortError =
        error instanceof DOMException
          ? error.name === "AbortError"
          : (error as any)?.name === "AbortError";
      if (isAbortError) {
        return;
      }
      console.error("Failed to fetch OpenRouter credits", error);
      setCreditsError("Credits unavailable");
    } finally {
      if (creditsRequestAbortControllerRef.current === controller) {
        creditsRequestAbortControllerRef.current = null;
        setCreditsLoading(false);
      }
    }
  }, [effectiveApiKey]);

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isAuthenticated: !!(apiKey || envApiKey),
    }));
  }, [apiKey, envApiKey]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    void refreshCredits();
  }, [isHydrated, refreshCredits]);

  useEffect(() => {
    return () => {
      if (creditsRequestAbortControllerRef.current) {
        creditsRequestAbortControllerRef.current.abort();
        creditsRequestAbortControllerRef.current = null;
      }
    };
  }, []);

  // Lazy-loading of folder bytes is handled inside useHistoryStore; nothing
  // for this component to schedule. The folder binding is also restored by
  // the store's hydrate() call.

  useEffect(() => {
    if (!historyStore.hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const persisted = await persistence.load();
        if (cancelled) {
          return;
        }

        if (persisted) {
          const legacyHistory = Array.isArray(persisted.appState?.history)
            ? (persisted.appState.history as ImageRecord[])
            : [];

          // One-shot migration: if the legacy IDB store still has images
          // embedded as base64 and the new history store is empty, push them
          // through. The hydrated guard above ensures we don't think the
          // store is empty when it's merely still loading.
          if (legacyHistory.length > 0 && historyStore.history.length === 0) {
            for (const item of legacyHistory) {
              if (!item?.id || !item.imageData) continue;
              try {
                await historyStore.addImage(item);
              } catch (error) {
                console.error("Legacy migration: failed to import", item.id, error);
              }
            }
          }

          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            targetImageId: persisted.appState?.targetImageId ?? null,
            referenceImageIds: Array.isArray(persisted.appState?.referenceImageIds)
              ? persisted.appState.referenceImageIds
              : [],
            rightPanelImageId: persisted.appState?.rightPanelImageId ?? null,
            isProcessing: false,
            error: null,
          }));

          // Strip ids may reference items in the store (post-migration) or in
          // the legacy persisted list. Treat both as valid sources.
          const knownEntries = [...historyStore.history, ...legacyHistory];
          const hydratedStrips = hydrateThumbnailStripsSnapshot(
            persisted.thumbnailStrips,
            knownEntries,
          );
          if (!cancelled) {
            setThumbnailStrips(hydratedStrips);
          }

          const persistedStyleId =
            typeof persisted.selectedArtStyleId === "string" &&
            persisted.selectedArtStyleId.trim().length
              ? persisted.selectedArtStyleId
              : null;

          const mergedParams = mergeParamsWithDefaults(persisted.paramsByTool);
          const fallbackStyleId =
            Object.values(mergedParams)
              .map((params) => getStyleIdFromParams(params))
              .find((styleId): styleId is string => Boolean(styleId)) || null;
          const resolvedStyleId = persistedStyleId || fallbackStyleId;

          const enhanceParams = mergedParams.enhance_drawing;
          if (
            enhanceParams?.styleId &&
            enhanceParams.styleId !== "cleanup-line-art" &&
            enhanceParams.styleId === resolvedStyleId
          ) {
            mergedParams.enhance_drawing = {
              ...enhanceParams,
              styleId: "cleanup-line-art",
            };
          }

          if (cancelled) return;
          setParamsByTool(mergedParams);
          setActiveToolId(persisted.activeToolId ?? null);

          if (!cancelled) {
            if (resolvedStyleId) {
              setSelectedArtStyleId(resolvedStyleId);
              updateAllArtStyleParams(resolvedStyleId);
            }
          }

          if (
            persisted.selectedModelId &&
            MODEL_CATALOG.some(
              (model) => model.id === persisted.selectedModelId,
            )
          ) {
            setSelectedModelId(persisted.selectedModelId);
          }
          setGenerationTiming(
            normalizeGenerationTiming(persisted.generationTiming),
          );
          setModelReasoningLevels(
            normalizeModelReasoningLevels(persisted.modelReasoningLevels),
          );
          if (persisted.auth?.apiKey) {
            setApiKey(persisted.auth.apiKey);
            setAuthMethod(persisted.auth.authMethod ?? null);
            setState((prev) => ({ ...prev, isAuthenticated: true }));
          }
        } else if (envApiKey) {
          setState((prev) => ({ ...prev, isAuthenticated: true }));
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // historyStore.addImage and historyStore.history are read at run-time
    // via a ref-like pattern; we don't need to refire this effect on every
    // snapshot. We DO need to refire when the store finishes hydrating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence, envApiKey, updateAllArtStyleParams, historyStore.hydrated]);

  useEffect(() => {
    if (!isHydrated || apiKey || typeof window === "undefined") {
      return;
    }
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!storedKey) return;

    const storedMethod = localStorage.getItem(AUTH_METHOD_STORAGE_KEY) as
      | "oauth"
      | "manual"
      | null;
    setApiKey(storedKey);
    setAuthMethod(storedMethod ?? "manual");
    setState((prev) => ({ ...prev, isAuthenticated: true }));
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
  }, [isHydrated, apiKey]);

  type IdleFriendlyWindow = Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  const debugLog = useCallback((...args: any[]) => {
    try {
      if (typeof window !== "undefined" && (window as any).__E2E_VERBOSE) {
        // eslint-disable-next-line no-console
        console.log("[persistence]", ...args);
      }
    } catch {
      // ignore
    }
  }, []);

  // Keep the latest inputs for persistence in refs so we can build the persisted object
  // off the critical input-event path (e.g., pointerup/dragend).
  const stateRef = useRef(state);
  const paramsByToolRef = useRef(paramsByTool);
  const activeToolIdRef = useRef(activeToolId);
  const selectedModelIdRef = useRef(selectedModelId);
  const generationTimingRef = useRef(generationTiming);
  const modelReasoningLevelsRef = useRef(modelReasoningLevels);
  const selectedArtStyleIdRef = useRef(selectedArtStyleId);
  const apiKeyRef = useRef(apiKey);
  const authMethodRef = useRef(authMethod);
  const thumbnailStripsRef = useRef(thumbnailStrips);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    paramsByToolRef.current = paramsByTool;
  }, [paramsByTool]);
  useEffect(() => {
    activeToolIdRef.current = activeToolId;
  }, [activeToolId]);
  useEffect(() => {
    selectedModelIdRef.current = selectedModelId;
  }, [selectedModelId]);
  useEffect(() => {
    generationTimingRef.current = generationTiming;
  }, [generationTiming]);
  useEffect(() => {
    modelReasoningLevelsRef.current = modelReasoningLevels;
  }, [modelReasoningLevels]);
  useEffect(() => {
    selectedArtStyleIdRef.current = selectedArtStyleId;
  }, [selectedArtStyleId]);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  useEffect(() => {
    authMethodRef.current = authMethod;
  }, [authMethod]);
  useEffect(() => {
    thumbnailStripsRef.current = thumbnailStrips;
  }, [thumbnailStrips]);

  // Folder attach/detach + sidecar+tombstone reconciliation are owned by
  // HistoryStore. The component just reflects the current snapshot via
  // historyStore.history.

  const persistenceScheduleRef = useRef<{
    idleHandle: number | null;
    timeoutHandle: number | null;
    saving: boolean;
    dirty: boolean;
  }>({ idleHandle: null, timeoutHandle: null, saving: false, dirty: false });

  const accessibleHistoryItems = useMemo(
    () => combinedHistory.filter((item) => !!item.imageData),
    [combinedHistory],
  );

  // With the HistoryStore-backed lazy loading, entries always become accessible
  // once bytes have streamed in. There is no separate "hidden" state for the UI
  // to expose.
  const hasHiddenHistory = false;

  useEffect(() => {
    if (!isHydrated || !persistence) return;

    const clearPending = () => {
      if (typeof window === "undefined") return;
      const handles = persistenceScheduleRef.current;
      if (handles.idleHandle !== null) {
        (window as IdleFriendlyWindow).cancelIdleCallback?.(handles.idleHandle);
        handles.idleHandle = null;
      }
      if (handles.timeoutHandle !== null) {
        window.clearTimeout(handles.timeoutHandle);
        handles.timeoutHandle = null;
      }
    };

    const buildPersistableState = () => {
      const currentState = stateRef.current;

      // The persistence prop only carries per-browser preferences now —
      // image history lives in HistoryStore (a separate IDB database).
      // We still write an empty history array so the persisted shape stays
      // backwards-compatible with any older consumer of `persistence.load()`.
      return {
        version: IMAGE_TOOLS_STATE_VERSION,
        appState: {
          targetImageId: currentState.targetImageId,
          referenceImageIds: currentState.referenceImageIds,
          rightPanelImageId: currentState.rightPanelImageId,
          history: [],
        },
        paramsByTool: paramsByToolRef.current,
        activeToolId: activeToolIdRef.current,
        selectedModelId: selectedModelIdRef.current || null,
        generationTiming: generationTimingRef.current,
        modelReasoningLevels: modelReasoningLevelsRef.current,
        selectedArtStyleId: selectedArtStyleIdRef.current ?? null,
        auth: {
          apiKey: apiKeyRef.current,
          authMethod: authMethodRef.current,
        },
        thumbnailStrips: thumbnailStripsRef.current,
      };
    };

    const runSave = async () => {
      const sched = persistenceScheduleRef.current;
      clearPending();

      if (sched.saving) {
        sched.dirty = true;
        return;
      }

      sched.saving = true;
      sched.dirty = false;
      const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      debugLog("save(start)");

      try {
        await persistence.save(buildPersistableState());
      } finally {
        const end =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        debugLog(`save(done) dt=${Math.round(end - start)}ms`);
        sched.saving = false;
        if (sched.dirty) {
          scheduleSave();
        }
      }
    };

    const scheduleSave = () => {
      if (typeof window === "undefined") {
        void runSave();
        return;
      }

      const sched = persistenceScheduleRef.current;
      sched.dirty = true;
      clearPending();

      const win = window as IdleFriendlyWindow;
      // Debounce a bit to coalesce rapid state changes, then run during idle time.
      const scheduleImpl = () => {
        if (typeof win.requestIdleCallback === "function") {
          sched.idleHandle = win.requestIdleCallback(
            () => {
              void runSave();
            },
            { timeout: 1500 },
          );
        } else {
          sched.timeoutHandle = window.setTimeout(() => {
            void runSave();
          }, 0);
        }
      };

      sched.timeoutHandle = window.setTimeout(scheduleImpl, 250);
    };

    scheduleSave();

    return () => {
      clearPending();
    };
  }, [
    persistence,
    isHydrated,
    state.targetImageId,
    state.referenceImageIds,
    state.rightPanelImageId,
    paramsByTool,
    activeToolId,
    selectedModelId,
    modelReasoningLevels,
    selectedArtStyleId,
    apiKey,
    authMethod,
    thumbnailStrips,
    debugLog,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setAuthLoading(true);
        const key = await handleOAuthCallback();
        if (!cancelled && key) {
          setApiKey(key);
          setAuthMethod("oauth");
        }
      } catch (err) {
        console.error("OpenRouter OAuth failed", err);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnableFolderStorage = useCallback(async () => {
    if (!fsSupported) return;
    setFsLoading(true);
    setFsError(null);
    try {
      const ok = await historyStore.attachFolder();
      if (!ok) return;
    } catch (error) {
      console.error("Failed to enable folder storage", error);
      setFsError("Could not enable folder storage.");
    } finally {
      setFsLoading(false);
    }
  }, [fsSupported, historyStore]);

  const handleDisableFolderStorage = useCallback(async () => {
    if (!isFolderPersistenceActive) return;
    setFsLoading(true);
    setFsError(null);
    try {
      await historyStore.detachFolder();
    } catch (error) {
      console.error("Failed to disable folder storage", error);
      setFsError("Could not disable folder storage.");
    } finally {
      setFsLoading(false);
    }
  }, [historyStore, isFolderPersistenceActive]);

  const handleCancelProcessing = useCallback(() => {
    const controller = requestAbortControllerRef.current;
    if (!controller) {
      return;
    }
    controller.abort();
    requestAbortControllerRef.current = null;
    setGenerationProgress(null);
    setState((prev) => ({ ...prev, isProcessing: false }));
  }, []);

  const handleApplyTool = async (
    toolId: string,
    params: Record<string, string>,
  ) => {
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

    const requiresEditImage = tool.editImage !== false;
    const targetImage =
      requiresEditImage && state.targetImageId
        ? combinedHistory.find((h) => h.id === state.targetImageId) || null
        : null;
    if (requiresEditImage && !targetImage) {
      setState((prev) => ({
        ...prev,
        error: "Select an image to edit before applying this tool.",
      }));
      return;
    }

    const { min, max } = getReferenceConstraints(tool.referenceImages);
    const referenceItems = state.referenceImageIds
      .map((id) => combinedHistory.find((h) => h.id === id) || null)
      .filter((h): h is ImageRecord => !!h);

    // Requirements: tools may require 0, 1, or 1+ reference images.
    if (referenceItems.length < min) {
      setState((prev) => ({
        ...prev,
        error:
          "Please add a reference image for this tool (drag from history or upload).",
      }));
      return;
    }

    if (state.isProcessing) return;

    setResultImageIds([]);
    setState((prev) => ({
      ...prev,
      isProcessing: true,
      error: null,
      rightPanelImageId: null,
    }));

    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;
    let shouldRefreshCredits = false;

    try {
      const basePrompt = tool.promptTemplate(params);

      const constrainedReferences = referenceItems.slice(0, max);
      const referenceStyleId =
        constrainedReferences
          .map((item) => getStyleIdFromImageRecord(item))
          .find((styleId): styleId is string => Boolean(styleId)) || null;
      const derivedSourceStyleId =
        getStyleIdFromParams(params) ||
        getStyleIdFromImageRecord(targetImage) ||
        referenceStyleId ||
        null;
      const editImageCount = requiresEditImage && targetImage ? 1 : 0;
      const referenceImageCount = constrainedReferences.length;
      const sourceSummary = formatSourceSummary(
        editImageCount,
        referenceImageCount,
      );
      const sourceImages = [
        ...(requiresEditImage && targetImage ? [targetImage.imageData] : []),
        ...constrainedReferences.map((h) => h.imageData),
      ];

      const prompt =
        tool.id === "custom"
          ? `Edit the first image. If more images are provided, treat them as style/"like this" references.\n\nInstructions:\n${basePrompt}`
          : basePrompt;

      const usesLocalBackgroundRemoval = tool.id === "remove_background";
      const modelTimingKey = usesLocalBackgroundRemoval
        ? "local-background-removal"
        : envApiKey && !apiKey
          ? "default-image-model"
          : selectedModel?.id || "default-image-model";
      const promptDurationKey = createPromptDurationKey(
        tool.id,
        modelTimingKey,
        prompt,
      );
      const toolDurationKey = createToolDurationKey(tool.id, modelTimingKey);

      let processedImageData: string;
      let durationMs = 0;
      let cost = 0;
      let model = "";
      let reasoningLevelForRequest: ModelReasoningLevel | null = null;
      let progressStartedAt = 0;

      if (usesLocalBackgroundRemoval) {
        if (!targetImage) {
          throw new Error("Select an image to edit before applying this tool.");
        }

        progressStartedAt = getNowMs();
        setGenerationProgress({
          startedAt: progressStartedAt,
          estimatedDurationMs: resolveEstimatedDurationMs(
            generationTimingRef.current,
            promptDurationKey,
            toolDurationKey,
          ),
        });

        const result = await removeBackgroundFromImage(targetImage.imageData, {
          signal: abortController.signal,
        });

        processedImageData = await applyPostProcessingPipeline(
          result.imageData,
          tool.postProcessingFunctions,
        );
        durationMs = result.durationMs;
        model = result.model;
      } else {
        const resolvedApiKey = effectiveApiKey;
        if (!resolvedApiKey) {
          setGenerationProgress(null);
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            error: "Connect to OpenRouter before running tools.",
          }));
          return;
        }

        shouldRefreshCredits = true;

        // In E2E, we authenticate via an env key. In that mode we want the model
        // to be controlled by VITE_OPENROUTER_IMAGE_MODEL (from the dev server env)
        // rather than whatever the UI's default model happens to be.
        const modelIdForRequest =
          envApiKey && !apiKey ? undefined : selectedModel?.id;
        const selectedModelIdForReasoning = selectedModel?.id || "";
        const configuredReasoningLevel =
          modelReasoningLevels[selectedModelIdForReasoning];
        const initialReasoningLevel = isModelReasoningLevel(
          selectedModel?.initialReasoningLevel,
        )
          ? selectedModel.initialReasoningLevel
          : "default";
        reasoningLevelForRequest =
          configuredReasoningLevel ?? initialReasoningLevel;

        // Build image configuration from tool parameters (shape/size)
        const imageConfig: ImageConfig = {
          shape: params.shape,
          size: params.size,
        };

        progressStartedAt = getNowMs();
        setGenerationProgress({
          startedAt: progressStartedAt,
          estimatedDurationMs: resolveEstimatedDurationMs(
            generationTimingRef.current,
            promptDurationKey,
            toolDurationKey,
          ),
        });

        const result = await editImage(
          sourceImages,
          prompt,
          resolvedApiKey,
          modelIdForRequest,
          {
            signal: abortController.signal,
            imageConfig,
            reasoningLevel: reasoningLevelForRequest,
          },
        );

        processedImageData = await applyPostProcessingPipeline(
          result.imageData,
          tool.postProcessingFunctions,
        );
        durationMs = result.duration;
        cost = result.cost;
        model = result.model;
      }

      const createHistoryItem = async (
        imageData: string,
        parentIdOverride?: string | null,
      ): Promise<ImageRecord> => {
        const resolution = await getImageDimensions(imageData);
        // The HistoryStore decides the id (timestamp + slug + rand) and
        // handles folder writes via the WAL, so we no longer call out to
        // persistHistoryImage here.
        return {
          id: uuid(),
          parentId:
            parentIdOverride !== undefined
              ? parentIdOverride
              : requiresEditImage && targetImage
                ? targetImage.id
                : constrainedReferences[0]?.id || null,
          imageData,
          toolId: tool.id,
          parameters: params,
          durationMs,
          cost,
          model,
          reasoningLevel: reasoningLevelForRequest,
          timestamp: Date.now(),
          promptUsed: prompt,
          sourceStyleId: derivedSourceStyleId,
          sourceSummary,
          resolution,
          isStarred: false,
        };
      };

      const finalizeDerivedItems = (
        createdItems: ImageRecord[],
        options?: { showAsCollection?: boolean },
      ) => {
        const { showAsCollection = false } = options || {};
        if (progressStartedAt > 0) {
          const observedDurationMs = Math.max(1, getNowMs() - progressStartedAt);
          setGenerationTiming((prev) =>
            updateGenerationTiming(
              prev,
              promptDurationKey,
              toolDurationKey,
              observedDurationMs,
            ),
          );
        }

        setResultImageIds(
          showAsCollection ? createdItems.map((item) => item.id) : [],
        );
        setGenerationProgress(null);
        setState((prev) => ({
          ...prev,
          rightPanelImageId: createdItems[0]?.id || null,
          isProcessing: false,
        }));
      };

      if (tool.derivedResultMode) {
        const derivedItemsResult = await extractDerivedImageItems(
          processedImageData,
          {
            signal: abortController.signal,
          },
        );
        durationMs += derivedItemsResult.durationMs;

        const parentId = constrainedReferences[0]?.id || null;

        if (tool.derivedResultMode === "split-images") {
          const createdPieces: ImageRecord[] = [];

          for (const pieceImage of derivedItemsResult.imageDataItems) {
            const pieceItem = await createHistoryItem(pieceImage, parentId);
            createdPieces.push(pieceItem);
            await appendHistoryEntry(pieceItem);
          }

          finalizeDerivedItems(createdPieces, { showAsCollection: true });
          return;
        }

        const gifImageData = await createAnimatedGif(
          derivedItemsResult.imageDataItems,
          { delayMs: 140, repeat: 0 },
        );
        const gifItem = await createHistoryItem(gifImageData, parentId);
        await appendHistoryEntry(gifItem);
        finalizeDerivedItems([gifItem]);
        return;
      }

      const newItem = await createHistoryItem(processedImageData);

      if (progressStartedAt > 0) {
        const observedDurationMs = Math.max(1, getNowMs() - progressStartedAt);
        setGenerationTiming((prev) =>
          updateGenerationTiming(
            prev,
            promptDurationKey,
            toolDurationKey,
            observedDurationMs,
          ),
        );
      }

      await appendHistoryEntry(newItem);
      setGenerationProgress(null);
      setState((prev) => ({
        ...prev,
        rightPanelImageId: newItem.id, // Result goes to right panel
        isProcessing: false,
      }));
    } catch (error) {
      const isAbortError =
        error instanceof DOMException
          ? error.name === "AbortError"
          : (error as any)?.name === "AbortError";
      setGenerationProgress(null);
      if (isAbortError) {
        shouldRefreshCredits = false;
        setState((prev) => ({ ...prev, isProcessing: false }));
      } else {
        console.error("Failed to apply tool:", error);
        let errorContent: React.ReactNode;
        if (
          error instanceof OpenRouterApiError &&
          error.reason === "insufficient-credits" &&
          error.detailMessage
        ) {
          const infoUrl = error.infoUrl || OPENROUTER_KEYS_URL;
          errorContent = buildInsufficientCreditsError(
            error.detailMessage,
            infoUrl,
          );
        } else {
          errorContent =
            error instanceof Error ? error.message : "Failed to process image.";
        }
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: errorContent,
        }));
      }
    } finally {
      if (requestAbortControllerRef.current === abortController) {
        requestAbortControllerRef.current = null;
      }
      if (shouldRefreshCredits) {
        void refreshCredits();
      }
    }
  };

  const handleParamChange = useCallback(
    (toolId: string, paramName: string, value: string) => {
      setParamsByTool((prev) => ({
        ...prev,
        [toolId]: {
          ...(prev[toolId] || {}),
          [paramName]: value,
        },
      }));
    },
    [],
  );

  const handleUpload = useCallback(
    async (file: File, targetPanel: "target" | "right") => {
      try {
        const { dataUrl, dimensions } = await prepareImageBlob(file);
        const newItem: ImageRecord = {
          id: uuid(),
          parentId: null,
          imageData: dataUrl,
          toolId: "original",
          parameters: {},
          sourceStyleId: null,
          durationMs: 0,
          cost: 0,
          model: "",
          timestamp: Date.now(),
          promptUsed: "Original Upload",
          resolution: dimensions,
          isStarred: false,
        };

        await appendHistoryEntry(newItem);
        setState((prev) => ({
          ...prev,
          targetImageId:
            targetPanel === "target" ? newItem.id : prev.targetImageId,
          referenceImageIds:
            targetPanel === "target"
              ? prev.referenceImageIds.filter((id) => id !== newItem.id)
              : prev.referenceImageIds,
          rightPanelImageId:
            targetPanel === "right" ? newItem.id : prev.rightPanelImageId,
        }));
      } catch (error) {
        console.error("Failed to load image", error);
        setState((prev) => ({
          ...prev,
          error: "Could not load image. Please try again.",
        }));
      }
    },
    [appendHistoryEntry],
  );

  const handleUploadTarget = useCallback(
    (file: File) => {
      void handleUpload(file, "target");
    },
    [handleUpload],
  );
  const handleUploadRight = useCallback(
    (file: File) => {
      setResultImageIds([]);
      void handleUpload(file, "right");
    },
    [handleUpload],
  );

  const handleSetTargetImage = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      targetImageId: id,
      referenceImageIds: prev.referenceImageIds.filter((refId) => refId !== id),
      rightPanelImageId:
        prev.rightPanelImageId === id ? null : prev.rightPanelImageId,
    }));
  }, []);

  const handleClearTargetImage = useCallback(() => {
    setState((prev) => ({ ...prev, targetImageId: null }));
  }, []);

  const handleUploadReference = useCallback(
    async (file: File, slotIndex?: number) => {
      const mode = getToolReferenceMode(activeToolId);
      const { max } = getReferenceConstraints(mode);

      if (max === 0) return;

      try {
        const { dataUrl, dimensions } = await prepareImageBlob(file);

        const newItem: ImageRecord = {
          id: uuid(),
          parentId: null,
          imageData: dataUrl,
          toolId: "original",
          parameters: {},
          sourceStyleId: null,
          durationMs: 0,
          cost: 0,
          model: "",
          timestamp: Date.now(),
          promptUsed: "Original Upload",
          resolution: dimensions,
          isStarred: false,
        };

        await appendHistoryEntry(newItem);
        setState((prev) => {
          const nextIds = [...prev.referenceImageIds];
          const idx =
            typeof slotIndex === "number" && slotIndex >= 0
              ? slotIndex
              : nextIds.length;

          if (idx < nextIds.length) {
            nextIds[idx] = newItem.id;
          } else {
            nextIds.push(newItem.id);
          }

          return {
            ...prev,
            referenceImageIds: nextIds.slice(0, max),
          };
        });
      } catch (error) {
        console.error("Failed to load reference image", error);
        setState((prev) => ({
          ...prev,
          error: "Could not load reference image. Please try again.",
        }));
      }
    },
    [activeToolId, appendHistoryEntry],
  );

  // Global Paste Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (!file || !file.type.startsWith("image/")) {
        return;
      }

      const tool = activeToolId
        ? TOOLS.find((t) => t.id === activeToolId)
        : null;
      const requiresEditImage = tool?.editImage !== false;
      const referenceMode = getToolReferenceMode(activeToolId);
      const { max } = getReferenceConstraints(referenceMode);
      const hasReferenceCapacity = max > 0;

      e.preventDefault();

      if (requiresEditImage && !state.targetImageId) {
        handleUploadTarget(file);
        return;
      }

      if (hasReferenceCapacity) {
        handleUploadReference(file);
        return;
      }

      if (requiresEditImage) {
        handleUploadTarget(file);
      } else {
        handleUploadRight(file);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    activeToolId,
    state.targetImageId,
    handleUploadReference,
    handleUploadTarget,
    handleUploadRight,
  ]);

  const handleConnect = async () => {
    try {
      setAuthLoading(true);
      await initiateOAuthFlow();
    } catch (err) {
      console.error("Failed to start OpenRouter OAuth", err);
      setAuthLoading(false);
      setState((prev) => ({
        ...prev,
        error: "Could not start OpenRouter authentication. Please try again.",
      }));
    }
  };

  const handleDisconnect = () => {
    setApiKey(null);
    setAuthMethod(null);
    setState((prev) => ({ ...prev, isAuthenticated: !!envApiKey }));
  };

  const handleProvideKey = (key: string) => {
    const trimmed = key.trim();
    if (!trimmed) {
      setApiKey(null);
      setAuthMethod(null);
      setState((prev) => ({ ...prev, isAuthenticated: !!envApiKey }));
      return;
    }
    setApiKey(trimmed);
    setAuthMethod("manual");
    setState((prev) => ({ ...prev, isAuthenticated: true }));
  };

  const handleSetReferenceAt = (index: number, id: string) => {
    const mode = getToolReferenceMode(activeToolId);
    const { max } = getReferenceConstraints(mode);

    if (max === 0) return;

    setState((prev) => {
      const next = [...prev.referenceImageIds];
      if (index < next.length) {
        next[index] = id;
      } else {
        next.push(id);
      }

      return {
        ...prev,
        referenceImageIds: next.slice(0, max),
        rightPanelImageId:
          prev.rightPanelImageId === id ? null : prev.rightPanelImageId,
      };
    });
  };

  const handleSetRightPanel = (id: string) => {
    setResultImageIds([]);
    setState((prev) => ({ ...prev, rightPanelImageId: id }));
  };

  const handleRemoveReferenceAt = (index: number) => {
    setState((prev) => ({
      ...prev,
      referenceImageIds: prev.referenceImageIds.filter((_, i) => i !== index),
    }));
  };

  const handleClearRightPanel = () => {
    setResultImageIds([]);
    setState((prev) => ({ ...prev, rightPanelImageId: null }));
  };

  const handleSelectHistoryItem = (id: string) => {
    setResultImageIds([]);
    setState((prev) => ({ ...prev, rightPanelImageId: id }));
  };

  const handleToggleHistoryStar = useCallback(
    (id: string) => {
      const entry = historyStore.history.find((item) => item.id === id);
      if (!entry) return;
      const next = !entry.isStarred;
      void historyStore.setStarred(id, next);
      setThumbnailStrips((prev) =>
        next
          ? addItemToStrip(prev, "starred", id)
          : removeItemFromStrip(prev, "starred", id),
      );
    },
    [historyStore],
  );

  const handleStripItemDrop = useCallback(
    (
      stripId: ThumbnailStripId,
      dropIndex: number,
      draggedId: string | null,
      _event?: React.DragEvent | null,
    ) => {
      if (!draggedId) {
        return;
      }
      const config = resolvedThumbnailStripConfigs[stripId];
      if (!config.allowDrop) {
        return;
      }
      const exists = combinedHistory.some((item) => item.id === draggedId);
      if (!exists) {
        return;
      }
      setThumbnailStrips((prev) => {
        const current = prev.itemIdsByStrip[stripId] || [];
        if (current.includes(draggedId)) {
          if (!config.allowReorder) {
            return prev;
          }
          return reorderItemInStrip(prev, stripId, draggedId, dropIndex);
        }
        return addItemToStrip(prev, stripId, draggedId, dropIndex);
      });
    },
    [combinedHistory, resolvedThumbnailStripConfigs],
  );

  const handleStripPinToggle = useCallback((stripId: ThumbnailStripId) => {
    setThumbnailStrips((prev) => {
      const isPinned = prev.pinnedStripIds.includes(stripId);
      return setStripPinState(prev, stripId, !isPinned);
    });
  }, []);

  const handleStripActivate = useCallback((stripId: ThumbnailStripId) => {
    setThumbnailStrips((prev) => setActiveStrip(prev, stripId));
  }, []);

  const handleStripDragActivate = handleStripActivate;

  const handleStripRemoveItem = useCallback(
    (stripId: ThumbnailStripId, imageId: string) => {
      const config = resolvedThumbnailStripConfigs[stripId];
      if (!config.allowRemove) {
        return;
      }
      if (stripId === "starred") {
        const entry = combinedHistory.find((item) => item.id === imageId);
        if (entry?.isStarred) {
          handleToggleHistoryStar(imageId);
        }
        return;
      }
      if (stripId === "history") {
        // Removing from the history strip is an explicit delete: write a
        // tombstone (in folder mode) and drop the entry from memory + cache.
        // Environment items are virtual and never get deleted from the store.
        const entry = combinedHistory.find((item) => item.id === imageId);
        if (entry && entry.origin !== "environment") {
          void historyStore.deleteImage(imageId);
        }
        setThumbnailStrips((prev) => removeItemFromStrip(prev, stripId, imageId));
        return;
      }

      setThumbnailStrips((prev) => removeItemFromStrip(prev, stripId, imageId));
    },
    [
      combinedHistory,
      handleToggleHistoryStar,
      historyStore,
      resolvedThumbnailStripConfigs,
    ],
  );

  const handleDismissError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  const handleSelectModel = (
    modelId: string,
    reasoningLevels: ModelReasoningLevelByModelId,
  ) => {
    setSelectedModelId(modelId);
    setModelReasoningLevels(normalizeModelReasoningLevels(reasoningLevels));
  };

  const targetImage = state.targetImageId
    ? accessibleHistoryItems.find((h) => h.id === state.targetImageId) || null
    : null;

  const referenceItems = state.referenceImageIds
    .map((id) => accessibleHistoryItems.find((h) => h.id === id) || null)
    .filter((h): h is ImageRecord => !!h);
  const rightItem =
    accessibleHistoryItems.find((h) => h.id === state.rightPanelImageId) ||
    null;
  const resultItems = resultImageIds
    .map((id) => accessibleHistoryItems.find((h) => h.id === id) || null)
    .filter((item): item is ImageRecord => !!item);

  const handleToolSelectWithConstraints = (toolId: string | null) => {
    setActiveToolId(toolId);

    const mode = getToolReferenceMode(toolId);
    const { max } = getReferenceConstraints(mode);

    setState((prev) => {
      if (max === 0) {
        return { ...prev, referenceImageIds: [] };
      }
      if (max === 1) {
        return {
          ...prev,
          referenceImageIds: prev.referenceImageIds.slice(0, 1),
        };
      }
      return prev;
    });
  };

  const creditsPrimaryLabel = (() => {
    if (!effectiveApiKey) {
      return "Connect to view";
    }
    if (creditsLoading) {
      return "Updating...";
    }
    if (creditsError) {
      return creditsError;
    }
    if (credits) {
      return `${formatCreditsValue(credits.remainingCredits)} left`;
    }
    return "--";
  })();

  const creditsSecondaryLabel =
    effectiveApiKey && credits && !creditsLoading && !creditsError
      ? `${formatCreditsValue(credits.totalUsage)} used / ${formatCreditsValue(
          credits.totalCredits,
        )} total`
      : null;

  const creditsTooltipLines = [
    creditsPrimaryLabel,
    creditsSecondaryLabel,
  ].filter((line): line is string => Boolean(line));

  const creditsTooltipLabel =
    creditsTooltipLines.join(". ") || creditsPrimaryLabel;

  const creditsProgressFraction =
    credits && credits.totalCredits > 0
      ? Math.min(
          1,
          Math.max(0, credits.remainingCredits / credits.totalCredits),
        )
      : null;

  const creditsProgressAriaProps: React.HTMLAttributes<HTMLElement> =
    creditsProgressFraction !== null && credits
      ? {
          role: "progressbar",
          "aria-valuemin": 0,
          "aria-valuemax": credits.totalCredits,
          "aria-valuenow": credits.remainingCredits,
        }
      : { role: "status" };

  const isCreditsLow =
    creditsProgressFraction !== null && !creditsError
      ? creditsProgressFraction < 0.1
      : false;

  const creditsLabelColor = isCreditsLow
    ? theme.colors.danger
    : theme.colors.textMuted;

  const progressTrackBackground = creditsError
    ? "rgba(239, 68, 68, 0.15)"
    : isCreditsLow
      ? theme.colors.dangerSubtle
      : theme.colors.surfaceAlt;

  const progressBorderColor = isCreditsLow
    ? theme.colors.danger
    : theme.colors.border;

  const progressFillColor = creditsError
    ? "#ef4444"
    : isCreditsLow
      ? theme.colors.danger
      : theme.colors.accent;

  const shouldShowConnectToOpenRouterCTA = !effectiveApiKey;
  const prototypeNoticeColor = theme.colors.accent;

  const triggerConnectCtaAttention = useCallback(() => {
    setConnectCtaAttentionKey((current) => current + 1);
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          minHeight: 0,
          backgroundColor: theme.colors.appBackground,
          color: theme.colors.textPrimary,
          fontFamily: 'Roboto, "Noto Sans", sans-serif',
          overflow: "hidden",
        }}
      >
        <Box
          component="header"
          sx={{
            minHeight: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: "24px",
            py: 1.5,
            gap: 2,
            zIndex: 30,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ flex: 1, minWidth: 0, flexWrap: "wrap", rowGap: 0.75 }}
          >
            <Box
              component="img"
              src={bloomLogo}
              alt="Bloom"
              sx={{ width: 28, height: 28 }}
            />
            <Typography variant="h6" component="h1" fontWeight={700}>
              Bloom AI Image Tools
            </Typography>
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{ color: prototypeNoticeColor, minWidth: 0 }}
            >
              <Icon path={Icons.Info} width={16} height={16} />
              <Typography
                variant="body2"
                sx={{
                  color: "inherit",
                  fontWeight: 400,
                  lineHeight: 1.4,
                }}
              >
                This is prototype. It is useful, but it has rough edges!
              </Typography>
            </Stack>
          </Stack>

          <Stack spacing={1} alignItems="flex-end" sx={{ flexShrink: 0 }}>
            <Stack direction="row" spacing={3} alignItems="center">
              <OpenRouterCreditsHeader
                shouldShowConnectToOpenRouterCTA={
                  shouldShowConnectToOpenRouterCTA
                }
                onOpenSettingsDialog={() => setIsSettingsDialogOpen(true)}
                connectCtaAttentionKey={connectCtaAttentionKey}
                creditsTooltipLabel={creditsTooltipLabel}
                creditsTooltipLines={creditsTooltipLines}
                creditsProgressFraction={creditsProgressFraction}
                creditsProgressAriaProps={creditsProgressAriaProps}
                creditsLabelColor={creditsLabelColor}
                progressBorderColor={progressBorderColor}
                progressTrackBackground={progressTrackBackground}
                progressFillColor={progressFillColor}
                appColors={theme.colors}
              />
              {selectedModel && (
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => setIsModelDialogOpen(true)}
                  sx={{
                    borderRadius: "999px",
                    fontWeight: 400,
                    fontSize: "0.9rem",
                    letterSpacing: "0.04em",
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceAlt,
                    boxShadow: theme.colors.panelShadow,
                    color: theme.colors.textPrimary,
                  }}
                >
                  Model: {selectedModel.name}
                </Button>
              )}
              <IconButton
                onClick={() => setIsSettingsDialogOpen(true)}
                title={settingsButtonTitle}
                aria-label={settingsButtonLabel}
                sx={{
                  position: "relative",
                  border: `1px solid ${theme.colors.border}`,
                  bgcolor: theme.colors.surfaceAlt,
                  boxShadow: theme.colors.panelShadow,
                  color: theme.colors.textPrimary,
                  transition: "opacity 150ms ease",
                  "&:hover": { opacity: 0.85 },
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    width: 16,
                    height: 16,
                    animation: fsLoading
                      ? `${rotate360} 0.8s linear infinite`
                      : "none",
                  }}
                >
                  <path d={Icons.Gear} />
                </svg>
                {isFolderPersistenceActive && (
                  <Box
                    component="span"
                    sx={{
                      position: "absolute",
                      top: 6,
                      right: 6,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: theme.colors.accent,
                    }}
                  />
                )}
              </IconButton>
            </Stack>
            {fsError && (
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ color: "#ef4444" }}
                role="alert"
              >
                {fsError}
              </Typography>
            )}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ImageToolsBar
            appState={appStateForChildren}
            selectedModel={selectedModel || null}
            isToolRailDisabled={shouldShowConnectToOpenRouterCTA}
            onDisabledToolRailClick={triggerConnectCtaAttention}
            targetImage={targetImage}
            referenceImages={referenceItems}
            rightImage={rightItem}
            resultImages={resultItems}
            activeToolId={activeToolId}
            toolParams={paramsByTool}
            historyItems={accessibleHistoryItems}
            hasHiddenHistory={hasHiddenHistory}
            onRequestHistoryAccess={() => {
              if (!fsSupported) {
                setIsSettingsDialogOpen(true);
                return;
              }
              void handleEnableFolderStorage();
            }}
            thumbnailStrips={thumbnailStrips}
            thumbnailStripConfigs={resolvedThumbnailStripConfigs}
            onStripItemDrop={handleStripItemDrop}
            onStripRemoveItem={handleStripRemoveItem}
            onStripPinToggle={handleStripPinToggle}
            onStripActivate={handleStripActivate}
            onStripDragActivate={handleStripDragActivate}
            onApplyTool={handleApplyTool}
            onCancelProcessing={handleCancelProcessing}
            onToolSelect={handleToolSelectWithConstraints}
            onParamChange={handleParamChange}
            selectedArtStyleId={selectedArtStyleId}
            onArtStyleChange={handleArtStyleChange}
            onSetTarget={handleSetTargetImage}
            onSetReferenceAt={handleSetReferenceAt}
            onSetRight={handleSetRightPanel}
            onUploadTarget={handleUploadTarget}
            onRemoveReferenceAt={handleRemoveReferenceAt}
            onUploadReference={handleUploadReference}
            onClearTarget={handleClearTargetImage}
            onClearRight={handleClearRightPanel}
            onUploadRight={handleUploadRight}
            onSelectHistoryItem={handleSelectHistoryItem}
            onToggleHistoryStar={handleToggleHistoryStar}
            generationProgress={generationProgress}
            onDismissError={handleDismissError}
          />
        </Box>

        <AIImageToolsSettingsDialog
          isOpen={isSettingsDialogOpen}
          onClose={() => setIsSettingsDialogOpen(false)}
          openRouter={{
            isAuthenticated: state.isAuthenticated,
            isLoading: authLoading,
            usingEnvKey,
            authMethod,
            apiKeyPreview: apiKey || envApiKey || null,
            onConnect: handleConnect,
            onDisconnect: handleDisconnect,
            onProvideKey: handleProvideKey,
          }}
          history={{
            isSupported: fsSupported,
            isLoading: fsLoading,
            isFolderPersistenceActive,
            directoryName: folderName,
            error: fsError,
            onEnableFolder: () => {
              void handleEnableFolderStorage();
            },
            onDisableFolder: () => {
              void handleDisableFolderStorage();
            },
          }}
        />

        <ModelChooserDialog
          isOpen={isModelDialogOpen}
          models={MODEL_CATALOG}
          selectedModelId={selectedModel?.id || ""}
          modelReasoningLevels={modelReasoningLevels}
          onSelect={handleSelectModel}
          onClose={() => setIsModelDialogOpen(false)}
        />
      </Box>
    </ThemeProvider>
  );
}

export default ImageToolsWorkspace;
