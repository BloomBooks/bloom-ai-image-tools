import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, Button, CssBaseline, IconButton, Stack, Typography } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { keyframes } from "@emotion/react";
import {
  AppState,
  GenerationProgressState,
  GenerationTimingState,
  ImageRecord,
  ImageToolsStatePersistence,
  MeasuredStats,
  ModelReasoningLevel,
  PersistedAppState,
  ThumbnailStripId,
  ThumbnailStripsSnapshot,
  ToolParamsById,
} from "../types";
import { ImageToolsBar } from "./ImageToolsBar";
import {
  editImage,
  generateText,
  OpenRouterApiError,
  OPENROUTER_KEYS_URL,
  ImageConfig,
} from "../services/openRouterService";
import {
  BREAK_COMIC_CAPTIONS_PROMPT,
  BREAK_COMIC_MERGE_MARGIN_RATIO,
  BREAK_COMIC_TEXT_MODEL,
} from "../lib/breakComic";
import { fetchOpenRouterKeyStatus, OpenRouterKeyStatus } from "../lib/openRouterKeyStatus";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "../themes";
import { darkTheme } from "./materialUITheme";
import {
  getOAuthCodeFromUrl,
  handleOAuthCallback,
  initiateOAuthFlow,
} from "../lib/openRouterOAuth";
import { canUseLocalDummyModelWithoutApiKey } from "../lib/localModels";
import {
  buildMeasuredStatKey,
  DEFAULT_MODEL,
  getModelInfoById,
  isModelReasoningLevel,
  MODEL_CATALOG,
  resolveToolModelId,
  resolveToolReasoningLevel,
} from "../lib/modelsCatalog";
import { pickSizeTokenForLongEdge } from "../lib/imageSizes";
import { OpenRouterWelcomeDialog } from "./OpenRouterWelcomeDialog";
import { OpenRouterCreditsHeader } from "./OpenRouterCreditsHeader";
import { AIImageToolsSettingsDialog } from "./AIImageToolsSettingsDialog";
import { ImagePreviewDialog } from "./ImagePreviewDialog";
import { Icon, Icons } from "./Icons";
import bloomLogo from "../assets/bloom.svg";
import { createToolParamDefaults, mergeParamsWithDefaults } from "./tools/toolParams";
import { copyImageRecordWithFeedback } from "./copyImageRecordToClipboard";
import { API_KEY_STORAGE_KEY, AUTH_METHOD_STORAGE_KEY } from "../lib/authStorage";
import { WELCOME_DIALOG_SKIP_FLAG } from "../lib/authFlags";
import {
  IMAGE_TOOLS_STATE_VERSION,
  LOCAL_HISTORY_CACHE_LIMIT,
} from "../services/persistence/constants";
import {
  collectHistoryImageDebugInfo,
  FileSystemImageBinding,
  deletePersistedHistoryItem,
  deriveImageFileName,
  forgetFileSystemImageBinding,
  listHistoryImageFiles,
  readFolderPersistedState,
  readImageFile,
  requestFileSystemImageBinding,
  restoreFileSystemImageBinding,
  supportsFileSystemAccess,
  writeFolderAppState,
  writeHistoryImageRecord,
} from "../services/persistence/fileSystemAccess";
import { getStyleIdFromParams, getStyleIdFromImageRecord } from "../lib/artStyles";
import {
  AUTO_ASPECT_RATIO,
  getAspectRatioPromptHint,
  resolveAspectRatioValue,
} from "../lib/aspectRatios";
import { getImageDimensions, getMimeTypeFromUrl, prepareImageBlob } from "../lib/imageUtils";
import {
  getRequestedAspectRatioValue,
  getReferenceConstraints,
  getToolReferenceMode,
} from "../lib/toolHelpers";
import { formatCreditsValue, formatSourceSummary } from "../lib/formatters";
import { removeBackgroundFromImage } from "../lib/backgroundRemoval.ts";
import {
  captionLeadingNumber,
  parseCaptionArray,
  stripLeadingTitle,
} from "../lib/captionExtraction";
import { createAnimatedGif } from "../lib/animatedGif";
import { applyPostProcessingPipeline } from "../lib/postProcessing";
import { extractDerivedImageItems } from "../lib/toolDerivedResults";
import {
  addItemToStrip,
  createDefaultThumbnailStripsSnapshot,
  hydrateThumbnailStripsSnapshot,
  mergeThumbnailStripsSnapshots,
  removeItemsFromAllStrips,
  removeItemFromStrip,
  reorderItemInStrip,
  replaceStripItems,
  setActiveStrip,
  setStripPinState,
  THUMBNAIL_STRIP_ORDER,
  resolveThumbnailStripConfigs,
  ThumbnailStripConfig,
} from "../lib/thumbnailStrips";
import { mergeHistoryFields, sanitizePersistedAppState } from "../lib/persistedAppState";

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

const linkifyMessageWithUrl = (message: string, url: string): React.ReactNode => {
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

const buildInsufficientCreditsError = (message: string, url: string): React.ReactNode => {
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

const DEFAULT_GENERATION_ESTIMATE_MS = 30000;
const MAX_PROMPT_DURATION_ESTIMATES = 40;
const MAX_TOOL_DURATION_ESTIMATES = 24;
const PESSIMISTIC_MS = 3000;
const HISTORY_HYDRATION_BATCH_SIZE = 8;
const PERSISTENCE_POINTER_QUIET_MS = 1000;
// Show the credits gauge in the "danger" (red) styling once the remaining
// balance drops below this many US dollars.
const LOW_CREDITS_THRESHOLD_USD = 3;

const getNowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const clampDurationMs = (value: number | null | undefined) => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return DEFAULT_GENERATION_ESTIMATE_MS;
  }

  return Math.max(1000, Math.min(300000, Math.round(value as number)));
};

const limitDurationMap = (durationsByKey: Record<string, number>, maxEntries: number) => {
  const entries = Object.entries(durationsByKey);
  if (entries.length <= maxEntries) {
    return durationsByKey;
  }

  return Object.fromEntries(entries.slice(-maxEntries));
};

const normalizeDurationMap = (value: unknown, maxEntries: number): Record<string, number> => {
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
    toolDurationsByKey: normalizeDurationMap(raw?.toolDurationsByKey, MAX_TOOL_DURATION_ESTIMATES),
  };
};

const createPromptDurationKey = (toolId: string, modelId: string, prompt: string) =>
  `${toolId}:${modelId}:${hashString(prompt.trim())}`;

const createToolDurationKey = (toolId: string, modelId: string) => `${toolId}:${modelId}`;

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

const normalizeModelByTool = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([toolId, modelId]) => {
    const cleanToolId = toolId.trim();
    if (
      cleanToolId &&
      typeof modelId === "string" &&
      MODEL_CATALOG.some((model) => model.id === modelId)
    ) {
      normalized[cleanToolId] = modelId;
    }
  });

  return normalized;
};

const normalizeReasoningByTool = (value: unknown): Record<string, ModelReasoningLevel> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Record<string, ModelReasoningLevel> = {};
  Object.entries(value as Record<string, unknown>).forEach(([toolId, level]) => {
    const cleanToolId = toolId.trim();
    if (cleanToolId && isModelReasoningLevel(level)) {
      normalized[cleanToolId] = level;
    }
  });

  return normalized;
};

const normalizeMeasuredStatsByKey = (value: unknown): Record<string, MeasuredStats> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: Record<string, MeasuredStats> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    const cleanKey = key.trim();
    if (!cleanKey || !entry || typeof entry !== "object") {
      return;
    }
    const { cost, durationMs } = entry as {
      cost?: unknown;
      durationMs?: unknown;
    };
    const safeCost = typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : 0;
    const safeDuration =
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
        ? durationMs
        : 0;
    if (safeCost > 0 || safeDuration > 0) {
      normalized[cleanKey] = { cost: safeCost, durationMs: safeDuration };
    }
  });

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

const buildRecoveredHistoryEntry = (entry: {
  id: string;
  fileName: string;
  lastModified: number;
}): ImageRecord => ({
  id: entry.id,
  parentId: null,
  imageData: "",
  imageFileName: entry.fileName,
  toolId: "unknown",
  parameters: {},
  sourceStyleId: null,
  durationMs: 0,
  cost: 0,
  model: "",
  timestamp: entry.lastModified || 0,
  promptUsed: "Recovered image",
  sourceSummary: "Recovered from folder",
  resolution: undefined,
  isStarred: false,
  origin: "generated",
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

export function ImageToolsWorkspace({
  persistence,
  envApiKey: envApiKeyProp = "",
  environmentImageUrls = [],
  environmentStripMode = "host",
  thumbnailStripConfigOverrides,
}: ImageToolsWorkspaceProps) {
  const [state, setState] = useState<AppState>({
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: null,
    history: [],
    isProcessing: false,
    isAuthenticated: false,
    error: null,
  });
  const [thumbnailStrips, setThumbnailStrips] = useState<ThumbnailStripsSnapshot>(() =>
    createDefaultThumbnailStripsSnapshot(),
  );

  const resolvedThumbnailStripConfigs = useMemo(
    () => resolveThumbnailStripConfigs(thumbnailStripConfigOverrides),
    [thumbnailStripConfigOverrides],
  );

  const [paramsByTool, setParamsByTool] = useState<ToolParamsById>(() => createToolParamDefaults());
  const [selectedArtStyleId, setSelectedArtStyleId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"oauth" | "manual" | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  // Per-tool model selection: each tool remembers its own chosen model and
  // reasoning level; `measuredStatsByKey` powers the indicator's cost/time tooltip.
  const [modelByTool, setModelByTool] = useState<Record<string, string>>({});
  const [reasoningByTool, setReasoningByTool] = useState<Record<string, ModelReasoningLevel>>({});
  const [measuredStatsByKey, setMeasuredStatsByKey] = useState<Record<string, MeasuredStats>>({});
  const [generationTiming, setGenerationTiming] = useState<GenerationTimingState>({
    lastDurationMs: null,
    promptDurationsByKey: {},
    toolDurationsByKey: {},
  });
  const [generationProgress, setGenerationProgress] = useState<GenerationProgressState | null>(
    null,
  );
  const [resultImageIds, setResultImageIds] = useState<string[]>([]);
  const [isPreviewModifierActive, setIsPreviewModifierActive] = useState(false);
  const [previewSelectionImageIds, setPreviewSelectionImageIds] = useState<string[]>([]);
  const [previewDialogImageIds, setPreviewDialogImageIds] = useState<string[]>([]);
  const [visibleStripItemIdsByStrip, setVisibleStripItemIdsByStrip] = useState<
    Record<ThumbnailStripId, string[]>
  >({
    history: [],
    characters: [],
    starred: [],
    reference: [],
    environment: [],
  });
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isWelcomeDialogOpen, setIsWelcomeDialogOpen] = useState(false);
  const hasShownWelcomeRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [credits, setCredits] = useState<OpenRouterKeyStatus | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [fsBinding, setFsBinding] = useState<FileSystemImageBinding | null>(null);
  const [fsLoading, setFsLoading] = useState(false);
  const [fsError, setFsError] = useState<string | null>(null);
  const [fsSupported, setFsSupported] = useState(() => supportsFileSystemAccess());
  const [isFsBindingRestoreReady, setIsFsBindingRestoreReady] = useState(
    !supportsFileSystemAccess(),
  );
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const creditsRequestAbortControllerRef = useRef<AbortController | null>(null);
  const pendingPreviewImageIdsRef = useRef<string[]>([]);
  const envApiKey = envApiKeyProp?.trim() || "";
  const effectiveApiKey = apiKey || envApiKey;
  // The active tool's resolved model decides whether we can run without an API
  // key (only the localhost dummy model qualifies).
  const activeToolModelId = (() => {
    const activeTool = activeToolId ? TOOLS.find((t) => t.id === activeToolId) : null;
    return activeTool ? resolveToolModelId(activeTool, modelByTool) : DEFAULT_MODEL?.id || "";
  })();
  const canUseSelectedModelWithoutApiKey = canUseLocalDummyModelWithoutApiKey(activeToolModelId);
  const usingEnvKey = !!(envApiKey && !apiKey);
  const resolvedEnvironmentEntries = useMemo(() => {
    return environmentImageUrls
      .map((url, index) => ({ url: url?.trim(), index }))
      .filter(({ url }) => Boolean(url))
      .map(({ url, index }) => buildEnvironmentEntry(url as string, index));
  }, [environmentImageUrls]);
  const isFolderPersistenceActive = !!fsBinding;
  const historyItemsById = useMemo(() => {
    const entriesById: Record<string, ImageRecord> = {};
    state.history.forEach((item) => {
      entriesById[item.id] = item;
    });
    return entriesById;
  }, [state.history]);
  const previewDialogImages = useMemo(
    () =>
      previewDialogImageIds
        .map((id) => historyItemsById[id])
        .filter((item): item is ImageRecord => Boolean(item))
        .slice(-4),
    [historyItemsById, previewDialogImageIds],
  );
  const openRouterStatusLabel = state.isAuthenticated
    ? usingEnvKey
      ? "OpenRouter key supplied by environment"
      : authMethod === "oauth"
        ? "OpenRouter connected via OAuth"
        : "OpenRouter API key linked"
    : "OpenRouter not connected";
  const historyStatusLabel = isFolderPersistenceActive
    ? `History syncing to ${fsBinding?.directoryName || "linked folder"}`
    : "History stored in browser only";
  const settingsButtonTitle = `${openRouterStatusLabel}. ${historyStatusLabel}.`;
  const settingsButtonLabel = `Settings • ${openRouterStatusLabel}; ${historyStatusLabel}`;

  const persistHistoryImage = useCallback(
    async (
      item: ImageRecord,
      bindingOverride?: FileSystemImageBinding | null,
    ): Promise<ImageRecord> => {
      const bindingToUse = bindingOverride ?? fsBinding;
      if (!bindingToUse || !item.imageData) {
        return item;
      }
      try {
        const mime = getMimeTypeFromUrl(item.imageData) ?? "image/png";
        return await writeHistoryImageRecord(bindingToUse, item);
      } catch (error) {
        const debugInfo = await collectHistoryImageDebugInfo(
          bindingToUse,
          item.imageFileName
            ? item.imageFileName
            : deriveImageFileName(item.id, getMimeTypeFromUrl(item.imageData) ?? "image/png"),
        ).catch((debugError) => ({
          failedToCollect: debugError instanceof Error ? debugError.message : String(debugError),
        }));
        const errorDetails =
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error;
        console.error("Failed to save history image", {
          historyId: item.id,
          directoryName: bindingToUse.directoryName,
          imageFileName: item.imageFileName,
          derivedMime: getMimeTypeFromUrl(item.imageData) ?? "image/png",
          derivedFileName: deriveImageFileName(
            item.id,
            getMimeTypeFromUrl(item.imageData) ?? "image/png",
          ),
          debugInfo,
          error: errorDetails,
        });
        setFsError("Could not save image to folder.");
        return item;
      }
    },
    [fsBinding],
  );

  const loadHistoryImageFromFolder = useCallback(
    async (item: ImageRecord): Promise<ImageRecord> => {
      if (!fsBinding || item.imageData || !item.imageFileName) {
        return item;
      }
      const dataUrl = await readImageFile(fsBinding, item.imageFileName);
      if (!dataUrl) {
        return item;
      }

      const resolution = item.resolution ?? (await getImageDimensions(dataUrl));
      return { ...item, imageData: dataUrl, resolution };
    },
    [fsBinding],
  );

  const deleteHistoryImageFromFolder = useCallback(
    async (item: ImageRecord) => {
      if (!fsBinding || !item.imageFileName) {
        return;
      }
      await deletePersistedHistoryItem(fsBinding, item);
    },
    [fsBinding],
  );

  const appendHistoryEntry = useCallback(
    (entry: ImageRecord, options?: { skipHistoryStrip?: boolean }) => {
      const { skipHistoryStrip = false } = options || {};
      setState((prev) => ({ ...prev, history: [...prev.history, entry] }));
      if (!skipHistoryStrip) {
        // Keep the history strip ordered newest-first (leftmost), matching
        // hydrate/build behavior.
        setThumbnailStrips((prev) => addItemToStrip(prev, "history", entry.id, 0));
      }
    },
    [],
  );

  const updateAllArtStyleParams = useCallback(
    (styleId: string) => {
      setParamsByTool((prev) => {
        let mutated = false;
        const next: ToolParamsById = { ...prev };

        TOOLS.forEach((tool) => {
          const artStyleParams = tool.parameters.filter((param) => param.type === "art-style");
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
    setFsSupported(supportsFileSystemAccess());
  }, []);

  useEffect(() => {
    const resolvedIds = resolvedEnvironmentEntries.map((entry) => entry.id);

    if (environmentStripMode === "host") {
      if (!resolvedEnvironmentEntries.length) {
        setThumbnailStrips((prev) => replaceStripItems(prev, "environment", []));
        return;
      }

      setState((prev) => {
        const existingIds = new Set(prev.history.map((item) => item.id));
        const nextHistory = [...prev.history];
        let mutated = false;
        resolvedEnvironmentEntries.forEach((entry) => {
          if (!existingIds.has(entry.id)) {
            nextHistory.push(entry);
            mutated = true;
          }
        });
        return mutated ? { ...prev, history: nextHistory } : prev;
      });

      setThumbnailStrips((prev) => replaceStripItems(prev, "environment", resolvedIds));

      return;
    }

    // editable mode: ensure host-provided items exist in history, but don't
    // overwrite the strip ordering/removals once the user starts editing.
    if (!isHydrated) {
      return;
    }

    if (resolvedEnvironmentEntries.length) {
      setState((prev) => {
        const existingIds = new Set(prev.history.map((item) => item.id));
        const nextHistory = [...prev.history];
        let mutated = false;
        resolvedEnvironmentEntries.forEach((entry) => {
          if (!existingIds.has(entry.id)) {
            nextHistory.push(entry);
            mutated = true;
          }
        });
        return mutated ? { ...prev, history: nextHistory } : prev;
      });
    }

    // Seed once if the strip has no items yet.
    if (resolvedIds.length) {
      setThumbnailStrips((prev) => {
        const current = prev.itemIdsByStrip.environment || [];
        if (current.length) {
          return prev;
        }
        return replaceStripItems(prev, "environment", resolvedIds);
      });
    }
  }, [resolvedEnvironmentEntries, environmentStripMode, isHydrated]);

  useEffect(() => {
    const referencedIds = new Set<string>();
    THUMBNAIL_STRIP_ORDER.forEach((stripId) => {
      (thumbnailStrips.itemIdsByStrip[stripId] || []).forEach((id) => referencedIds.add(id));
    });
    if (state.targetImageId) {
      referencedIds.add(state.targetImageId);
    }
    state.referenceImageIds.forEach((id) => referencedIds.add(id));
    if (state.rightPanelImageId) {
      referencedIds.add(state.rightPanelImageId);
    }

    // Leave very fresh entries alone: multi-item tools create their records
    // across several awaits before referencing them in a strip, and this
    // effect can run in between (deleting brand-new results as "orphans").
    const PRUNE_GRACE_MS = 15_000;
    const now = Date.now();
    const orphaned = state.history.filter(
      (entry) =>
        entry.origin !== "environment" &&
        !referencedIds.has(entry.id) &&
        now - (entry.timestamp ?? 0) > PRUNE_GRACE_MS,
    );
    if (!orphaned.length) {
      return;
    }

    orphaned.forEach((entry) => {
      void deleteHistoryImageFromFolder(entry);
    });

    const orphanedIds = new Set(orphaned.map((entry) => entry.id));

    setState((prev) => ({
      ...prev,
      history: prev.history.filter(
        (entry) => entry.origin === "environment" || referencedIds.has(entry.id),
      ),
      referenceImageIds: prev.referenceImageIds.filter((id) => referencedIds.has(id)),
      targetImageId:
        prev.targetImageId && referencedIds.has(prev.targetImageId) ? prev.targetImageId : null,
      rightPanelImageId:
        prev.rightPanelImageId && referencedIds.has(prev.rightPanelImageId)
          ? prev.rightPanelImageId
          : null,
    }));

    setThumbnailStrips((prev) => {
      return removeItemsFromAllStrips(prev, orphanedIds);
    });
  }, [
    deleteHistoryImageFromFolder,
    state.history,
    state.targetImageId,
    state.referenceImageIds,
    state.rightPanelImageId,
    thumbnailStrips,
  ]);

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
      const result = await fetchOpenRouterKeyStatus(effectiveApiKey, {
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
      console.error("Failed to fetch OpenRouter key status", error);
      setCreditsError("Key status unavailable");
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
    const shouldSkipWelcomeDialog =
      typeof window !== "undefined" &&
      window.sessionStorage?.getItem(WELCOME_DIALOG_SKIP_FLAG) === "1";

    if (
      isHydrated &&
      !effectiveApiKey &&
      !canUseSelectedModelWithoutApiKey &&
      !hasShownWelcomeRef.current &&
      !shouldSkipWelcomeDialog &&
      !getOAuthCodeFromUrl()
    ) {
      hasShownWelcomeRef.current = true;
      setIsWelcomeDialogOpen(true);
    }
  }, [isHydrated, effectiveApiKey, canUseSelectedModelWithoutApiKey]);

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

  const handleVisibleStripItemIdsChange = useCallback(
    (stripId: ThumbnailStripId, visibleItemIds: string[]) => {
      setVisibleStripItemIdsByStrip((prev) => {
        const nextIds = visibleItemIds.filter((id, index, ids) => ids.indexOf(id) === index);
        const currentIds = prev[stripId] || [];
        if (
          currentIds.length === nextIds.length &&
          currentIds.every((id, index) => id === nextIds[index])
        ) {
          return prev;
        }
        return {
          ...prev,
          [stripId]: nextIds,
        };
      });
    },
    [],
  );

  const hydrateCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    const addId = (id: string | null | undefined) => {
      if (id) {
        ids.add(id);
      }
    };

    addId(state.targetImageId);
    addId(state.rightPanelImageId);
    state.referenceImageIds.forEach(addId);
    resultImageIds.forEach(addId);
    Object.values(visibleStripItemIdsByStrip).forEach((visibleIds) => {
      visibleIds.forEach(addId);
    });

    return Array.from(ids);
  }, [
    resultImageIds,
    state.referenceImageIds,
    state.rightPanelImageId,
    state.targetImageId,
    visibleStripItemIdsByStrip,
  ]);

  useEffect(() => {
    if (!isHydrated || !fsBinding) {
      return;
    }

    const itemsNeedingData = hydrateCandidateIds
      .map((id) => state.history.find((item) => item.id === id) || null)
      .filter((item): item is ImageRecord =>
        Boolean(item && !item.imageData && !!item.imageFileName),
      );
    if (itemsNeedingData.length === 0) {
      return;
    }

    const nextBatch = itemsNeedingData.slice(0, HISTORY_HYDRATION_BATCH_SIZE);

    let cancelled = false;
    void (async () => {
      const start = getNowMs();
      debugLog("historyHydrate(start)", {
        batchCount: nextBatch.length,
        remainingCount: itemsNeedingData.length,
      });

      const updatedItems = await Promise.all(
        nextBatch.map((item) => loadHistoryImageFromFolder(item)),
      );
      if (cancelled) {
        return;
      }
      const updateMap = new Map<string, ImageRecord>(updatedItems.map((item) => [item.id, item]));
      setState((prev) => {
        let changed = false;
        const nextHistory = prev.history.map((item) => {
          const updated = updateMap.get(item.id);
          if (updated && updated.imageData && updated !== item) {
            changed = true;
            return updated;
          }
          return item;
        });
        return changed ? { ...prev, history: nextHistory } : prev;
      });

      debugLog("historyHydrate(done)", {
        batchCount: nextBatch.length,
        remainingCount: Math.max(itemsNeedingData.length - nextBatch.length, 0),
        durationMs: Math.round(getNowMs() - start),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, fsBinding, hydrateCandidateIds, state.history, loadHistoryImageFromFolder]);

  useEffect(() => {
    if (!fsSupported) {
      setIsFsBindingRestoreReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const binding = await restoreFileSystemImageBinding();
        if (cancelled) {
          return;
        }

        if (binding) {
          setFsBinding(binding);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to restore history folder binding", error);
        }
      } finally {
        if (!cancelled) {
          setIsFsBindingRestoreReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fsSupported]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!isFsBindingRestoreReady) {
        return;
      }

      try {
        const persisted = await persistence.load();
        if (cancelled) {
          return;
        }

        if (persisted) {
          const sanitized = sanitizePersistedAppState(persisted.appState, {
            allowFileBackedEntries: Boolean(fsBindingRef.current),
          });
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            ...sanitized,
            isProcessing: false,
            error: null,
          }));

          const hydratedStrips = hydrateThumbnailStripsSnapshot(
            persisted.thumbnailStrips,
            sanitized.history,
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

          setModelByTool(normalizeModelByTool(persisted.modelByTool));
          setReasoningByTool(normalizeReasoningByTool(persisted.reasoningByTool));
          setMeasuredStatsByKey(normalizeMeasuredStatsByKey(persisted.measuredStatsByKey));
          setGenerationTiming(normalizeGenerationTiming(persisted.generationTiming));
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
  }, [isFsBindingRestoreReady, persistence, envApiKey, updateAllArtStyleParams]);

  useEffect(() => {
    if (!isHydrated || apiKey || typeof window === "undefined") {
      return;
    }
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!storedKey) return;

    const storedMethod = localStorage.getItem(AUTH_METHOD_STORAGE_KEY) as "oauth" | "manual" | null;
    setApiKey(storedKey);
    setAuthMethod(storedMethod ?? "manual");
    setState((prev) => ({ ...prev, isAuthenticated: true }));
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
  }, [isHydrated, apiKey]);

  type IdleFriendlyWindow = Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
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
  const fsBindingRef = useRef(fsBinding);
  const paramsByToolRef = useRef(paramsByTool);
  const activeToolIdRef = useRef(activeToolId);
  const modelByToolRef = useRef(modelByTool);
  const reasoningByToolRef = useRef(reasoningByTool);
  const measuredStatsByKeyRef = useRef(measuredStatsByKey);
  const generationTimingRef = useRef(generationTiming);
  const selectedArtStyleIdRef = useRef(selectedArtStyleId);
  const apiKeyRef = useRef(apiKey);
  const authMethodRef = useRef(authMethod);
  const thumbnailStripsRef = useRef(thumbnailStrips);
  const fsManifestHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const fsManifestReadyHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    fsBindingRef.current = fsBinding;
  }, [fsBinding]);
  useEffect(() => {
    paramsByToolRef.current = paramsByTool;
  }, [paramsByTool]);
  useEffect(() => {
    activeToolIdRef.current = activeToolId;
  }, [activeToolId]);
  useEffect(() => {
    modelByToolRef.current = modelByTool;
  }, [modelByTool]);
  useEffect(() => {
    reasoningByToolRef.current = reasoningByTool;
  }, [reasoningByTool]);
  useEffect(() => {
    measuredStatsByKeyRef.current = measuredStatsByKey;
  }, [measuredStatsByKey]);
  useEffect(() => {
    generationTimingRef.current = generationTiming;
  }, [generationTiming]);
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

  useEffect(() => {
    if (!fsBinding) {
      fsManifestHandleRef.current = null;
      fsManifestReadyHandleRef.current = null;
    }
  }, [fsBinding]);

  useEffect(() => {
    if (!fsBinding || !isHydrated) {
      return;
    }
    if (fsManifestReadyHandleRef.current === fsBinding.directoryHandle) {
      return;
    }
    if (fsManifestHandleRef.current === fsBinding.directoryHandle) {
      return;
    }
    fsManifestHandleRef.current = fsBinding.directoryHandle;

    let cancelled = false;
    void (async () => {
      const folderState = await readFolderPersistedState(fsBinding);
      if (cancelled) {
        return;
      }

      let incomingAppState: PersistedAppState | null = null;
      let incomingStrips: ThumbnailStripsSnapshot | null | undefined = null;

      if (folderState) {
        incomingAppState = sanitizePersistedAppState(folderState.appState, {
          allowFileBackedEntries: true,
        });
        incomingStrips = folderState.thumbnailStrips;
      } else if (stateRef.current.history.length === 0) {
        const files = await listHistoryImageFiles(fsBinding);
        if (cancelled) {
          return;
        }
        if (files.length) {
          const recoveredHistory = files
            .sort((a, b) => a.lastModified - b.lastModified)
            .map((file) => buildRecoveredHistoryEntry(file));
          incomingAppState = sanitizePersistedAppState({
            targetImageId: null,
            referenceImageIds: [],
            rightPanelImageId: null,
            history: recoveredHistory,
          });
        }
      }

      if (!incomingAppState) {
        return;
      }

      const mergedFields = mergeHistoryFields(stateRef.current, incomingAppState, {
        preserveCurrentOnlyHistory: false,
      });
      if (cancelled) {
        return;
      }
      setState((prev) => ({ ...prev, ...mergedFields }));

      setThumbnailStrips(
        mergeThumbnailStripsSnapshots(
          thumbnailStripsRef.current,
          incomingStrips,
          mergedFields.history,
        ),
      );
      fsManifestReadyHandleRef.current = fsBinding.directoryHandle;
    })();

    return () => {
      cancelled = true;
    };
  }, [fsBinding, isHydrated]);

  const persistenceScheduleRef = useRef<{
    idleHandle: number | null;
    timeoutHandle: number | null;
    saving: boolean;
    dirty: boolean;
  }>({ idleHandle: null, timeoutHandle: null, saving: false, dirty: false });
  const pointerActivityRef = useRef({ isPointerDown: false, lastAt: 0 });

  const accessibleHistoryItems = useMemo(
    () => state.history.filter((item) => !!item.imageData),
    [state.history],
  );

  const hasHiddenHistory = useMemo(() => {
    if (fsBinding || !fsSupported) {
      return false;
    }
    return state.history.some((item) => !item.imageData && !!item.imageFileName);
  }, [fsBinding, fsSupported, state.history]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const markPointerDown = () => {
      pointerActivityRef.current = { isPointerDown: true, lastAt: getNowMs() };
    };

    const markPointerUp = () => {
      pointerActivityRef.current = { isPointerDown: false, lastAt: getNowMs() };
    };

    window.addEventListener("pointerdown", markPointerDown, true);
    window.addEventListener("pointerup", markPointerUp, true);
    window.addEventListener("pointercancel", markPointerUp, true);

    return () => {
      window.removeEventListener("pointerdown", markPointerDown, true);
      window.removeEventListener("pointerup", markPointerUp, true);
      window.removeEventListener("pointercancel", markPointerUp, true);
    };
  }, []);

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
      const currentFsBinding = fsBindingRef.current;

      const cacheStart = Math.max(currentState.history.length - LOCAL_HISTORY_CACHE_LIMIT, 0);

      const historyForPersistence = currentState.history.map((item, index) => {
        const keepImageData =
          !currentFsBinding || !item.imageFileName || !item.imageData || index >= cacheStart;
        if (keepImageData) {
          return item;
        }
        return { ...item, imageData: "" };
      });

      return {
        version: IMAGE_TOOLS_STATE_VERSION,
        appState: {
          targetImageId: currentState.targetImageId,
          referenceImageIds: currentState.referenceImageIds,
          rightPanelImageId: currentState.rightPanelImageId,
          history: historyForPersistence,
        },
        paramsByTool: paramsByToolRef.current,
        activeToolId: activeToolIdRef.current,
        modelByTool: modelByToolRef.current,
        reasoningByTool: reasoningByToolRef.current,
        measuredStatsByKey: measuredStatsByKeyRef.current,
        generationTiming: generationTimingRef.current,
        selectedArtStyleId: selectedArtStyleIdRef.current ?? null,
        auth: {
          apiKey: apiKeyRef.current,
          authMethod: authMethodRef.current,
        },
        thumbnailStrips: thumbnailStripsRef.current,
      };
    };

    const buildFolderAppState = () => ({
      thumbnailStrips: thumbnailStripsRef.current,
      targetImageId: stateRef.current.targetImageId,
      referenceImageIds: stateRef.current.referenceImageIds,
      rightPanelImageId: stateRef.current.rightPanelImageId,
      activeToolId: activeToolIdRef.current,
      modelByTool: modelByToolRef.current,
      selectedArtStyleId: selectedArtStyleIdRef.current ?? null,
    });

    const scheduleSave = (debounceMs = 250) => {
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

      sched.timeoutHandle = window.setTimeout(scheduleImpl, debounceMs);
    };

    const runSave = async () => {
      const sched = persistenceScheduleRef.current;
      clearPending();

      if (sched.saving) {
        sched.dirty = true;
        return;
      }

      if (typeof window !== "undefined") {
        const pointer = pointerActivityRef.current;
        const quietRemaining = pointer.isPointerDown
          ? PERSISTENCE_POINTER_QUIET_MS
          : Math.max(0, PERSISTENCE_POINTER_QUIET_MS - (getNowMs() - pointer.lastAt));

        if (quietRemaining > 0) {
          debugLog("save(defer:pointer)", {
            quietRemainingMs: Math.round(quietRemaining),
          });
          scheduleSave(quietRemaining);
          return;
        }
      }

      sched.saving = true;
      sched.dirty = false;
      const start = typeof performance !== "undefined" ? performance.now() : Date.now();
      debugLog("save(start)");

      try {
        await persistence.save(buildPersistableState());
        const currentBinding = fsBindingRef.current;
        if (currentBinding && fsManifestReadyHandleRef.current === currentBinding.directoryHandle) {
          try {
            await writeFolderAppState(currentBinding, buildFolderAppState());
          } catch (error) {
            console.error("Failed to persist history metadata", error);
            setFsError("Could not save history metadata to folder.");
          }
        }
      } finally {
        const end = typeof performance !== "undefined" ? performance.now() : Date.now();
        debugLog(`save(done) dt=${Math.round(end - start)}ms`);
        sched.saving = false;
        if (sched.dirty) {
          scheduleSave();
        }
      }
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
    state.history,
    fsBinding,
    paramsByTool,
    activeToolId,
    modelByTool,
    reasoningByTool,
    measuredStatsByKey,
    selectedArtStyleId,
    apiKey,
    authMethod,
    thumbnailStrips,
    debugLog,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
    if (!fsSupported) {
      return;
    }
    setFsLoading(true);
    setFsError(null);
    try {
      const binding = await requestFileSystemImageBinding();
      if (!binding) {
        return;
      }
      const existingFolderState = await readFolderPersistedState(binding);
      const incomingAppState = existingFolderState
        ? sanitizePersistedAppState(existingFolderState.appState, {
            allowFileBackedEntries: true,
          })
        : null;
      const mergedFields = incomingAppState
        ? mergeHistoryFields(stateRef.current, incomingAppState)
        : null;
      const historyToPersist = mergedFields?.history ?? stateRef.current.history;
      const migratedHistory = await Promise.all(
        historyToPersist.map((item) => persistHistoryImage(item, binding)),
      );
      const migratedMap = new Map(migratedHistory.map((item) => [item.id, item] as const));
      const nextHistory = historyToPersist.map((item) => migratedMap.get(item.id) ?? item);
      const nextThumbnailStrips = mergeThumbnailStripsSnapshots(
        thumbnailStripsRef.current,
        existingFolderState?.thumbnailStrips,
        nextHistory,
      );
      fsManifestHandleRef.current = binding.directoryHandle;
      fsManifestReadyHandleRef.current = binding.directoryHandle;
      setFsBinding(binding);
      setState((prev) => {
        if (!mergedFields) {
          return {
            ...prev,
            history: prev.history.map((item) => migratedMap.get(item.id) ?? item),
          };
        }
        return {
          ...prev,
          ...mergedFields,
          history: nextHistory,
        };
      });
      setThumbnailStrips(nextThumbnailStrips);
    } catch (error) {
      console.error("Failed to enable folder storage", error);
      setFsError("Could not enable folder storage.");
    } finally {
      setFsLoading(false);
    }
  }, [fsSupported, persistHistoryImage]);

  const handleDisableFolderStorage = useCallback(async () => {
    if (!fsBinding) {
      return;
    }
    setFsLoading(true);
    setFsError(null);
    try {
      const restoredHistory = await Promise.all(
        state.history.map(async (item) => {
          if (item.imageData || !item.imageFileName) {
            return item.imageFileName ? { ...item, imageFileName: null } : item;
          }
          const dataUrl = await readImageFile(fsBinding, item.imageFileName);
          if (dataUrl) {
            return { ...item, imageData: dataUrl, imageFileName: null };
          }
          return { ...item, imageFileName: null };
        }),
      );
      const restoredMap = new Map(restoredHistory.map((item) => [item.id, item] as const));
      await forgetFileSystemImageBinding();
      setFsBinding(null);
      setState((prev) => ({
        ...prev,
        history: prev.history.map((item) => restoredMap.get(item.id) ?? item),
      }));
    } catch (error) {
      console.error("Failed to disable folder storage", error);
      setFsError("Could not disable folder storage.");
    } finally {
      setFsLoading(false);
    }
  }, [fsBinding, state.history]);

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

  // Open the OS file picker and resolve with the chosen PDF (or null if the
  // user cancels). Resolving on cancel keeps the tool from hanging in a
  // "processing" state — we only show progress once a file is actually picked.
  const pickPdfFile = (): Promise<File | null> =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.style.display = "none";
      let settled = false;
      const finish = (file: File | null) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file);
      };
      input.addEventListener("change", () => finish(input.files?.[0] ?? null), {
        once: true,
      });
      // Fallback for the cancel case: the dialog blurs the window, so a focus
      // return with no `change` means the user dismissed it.
      window.addEventListener("focus", () => window.setTimeout(() => finish(null), 300), {
        once: true,
      });
      document.body.appendChild(input);
      input.click();
    });

  const runPdfToImages = async (params: Record<string, string>) => {
    if (state.isProcessing) return;

    const file = await pickPdfFile();
    if (!file) return; // User cancelled the picker.

    setResultImageIds([]);
    setState((prev) => ({
      ...prev,
      isProcessing: true,
      error: null,
      rightPanelImageId: null,
    }));

    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;

    const progressStartedAt = getNowMs();
    setGenerationProgress({
      startedAt: progressStartedAt,
      estimatedDurationMs: 4000,
    });

    try {
      const { renderPdfToImages } = await import("../lib/pdfToImages");
      const pages = await renderPdfToImages(file, {
        signal: abortController.signal,
      });

      if (!pages.length) {
        throw new Error("That PDF has no pages to render.");
      }

      const baseName = file.name.replace(/\.pdf$/i, "") || "page";
      const padWidth = String(pages.length).length;

      const createdItems: ImageRecord[] = [];
      for (const page of pages) {
        const pageLabel = String(page.pageNumber).padStart(padWidth, "0");
        let item: ImageRecord = {
          id: uuid(),
          parentId: null,
          imageData: page.dataUrl,
          imageFileName: `${baseName}-p${pageLabel}.png`,
          toolId: "pdf_to_images",
          parameters: params,
          sourceStyleId: null,
          durationMs: 0,
          cost: 0,
          model: "",
          timestamp: Date.now(),
          promptUsed: `Page ${page.pageNumber} of ${file.name}`,
          sourceSummary: `${file.name} (page ${page.pageNumber} of ${pages.length})`,
          resolution: page.dimensions,
          isStarred: false,
          origin: "uploaded",
        };
        if (fsBinding) {
          item = await persistHistoryImage(item);
        }
        createdItems.push(item);
      }

      // Insert the whole batch in one synchronous block so the orphan-cleanup
      // effect can't prune a page that's in history but not yet referenced by a
      // strip (see the split-images path for the same reasoning). Pages go into
      // the history strip in reading order (page 1 leftmost): addItemToStrip
      // prepends at index 0, so insert back-to-front.
      createdItems.forEach((item) => appendHistoryEntry(item, { skipHistoryStrip: true }));
      setThumbnailStrips((prev) => {
        let next = prev;
        for (let i = createdItems.length - 1; i >= 0; i -= 1) {
          next = addItemToStrip(next, "history", createdItems[i].id, 0);
        }
        return next;
      });

      setResultImageIds(createdItems.map((item) => item.id));
      setGenerationProgress(null);
      setState((prev) => ({
        ...prev,
        rightPanelImageId: createdItems[0]?.id ?? null,
        isProcessing: false,
      }));
    } catch (error) {
      const isAbortError =
        error instanceof DOMException
          ? error.name === "AbortError"
          : (error as any)?.name === "AbortError";
      setGenerationProgress(null);
      if (isAbortError) {
        setState((prev) => ({ ...prev, isProcessing: false }));
      } else {
        console.error("Failed to convert PDF to images:", error);
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: error instanceof Error ? error.message : "Could not read that PDF.",
        }));
      }
    } finally {
      if (requestAbortControllerRef.current === abortController) {
        requestAbortControllerRef.current = null;
      }
    }
  };

  const handleApplyTool = async (toolId: string, params: Record<string, string>) => {
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

    if (tool.localOnly && tool.id === "pdf_to_images") {
      await runPdfToImages(params);
      return;
    }

    // Each tool runs on its own selected model (see modelByTool), defaulting to
    // the tool's first recommended model.
    const toolModel = getModelInfoById(resolveToolModelId(tool, modelByTool)) ?? DEFAULT_MODEL;

    const requiresEditImage = tool.editImage !== false;
    const targetImage =
      requiresEditImage && state.targetImageId
        ? state.history.find((h) => h.id === state.targetImageId) || null
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
      .map((id) => state.history.find((h) => h.id === id) || null)
      .filter((h): h is ImageRecord => !!h);

    // Requirements: tools may require 0, 1, or 1+ reference images.
    if (referenceItems.length < min) {
      setState((prev) => ({
        ...prev,
        error: "Please add a reference image for this tool (drag from history or upload).",
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

    // Cancel only reliably interrupts in-flight fetches. The local post-network
    // phase (background removal, segmentation, GIF encoding) is largely
    // uninterruptible, so without a guard a result would still be committed to
    // history after the user cancels. Throw at each commit point if cancelled —
    // the catch below treats AbortError as a clean cancel.
    const throwIfCancelled = () => {
      if (abortController.signal.aborted) {
        throw new DOMException("Generation cancelled.", "AbortError");
      }
    };

    try {
      const targetImageResolution =
        targetImage?.resolution ??
        (targetImage?.imageData ? await getImageDimensions(targetImage.imageData) : undefined);
      if (
        targetImage &&
        targetImageResolution &&
        targetImage.resolution !== targetImageResolution
      ) {
        setState((prev) => ({
          ...prev,
          history: prev.history.map((item) =>
            item.id === targetImage.id ? { ...item, resolution: targetImageResolution } : item,
          ),
        }));
      }

      const basePrompt = tool.promptTemplate(params);
      let requestedAspectRatio = getRequestedAspectRatioValue(tool, params);

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
      const sourceSummary = formatSourceSummary(editImageCount, referenceImageCount);
      const sourceImages = [
        ...(requiresEditImage && targetImage ? [targetImage.imageData] : []),
        ...constrainedReferences.map((h) => h.imageData),
      ];

      // Tools that decompose a page (break-comic) must not downscale it. Match
      // the output size + aspect ratio to the input so resolution is preserved
      // (a 3508px poster -> 4K), instead of falling back to a square 1K default.
      let requestedSize = params.size;
      let autoSizeResolution: { width: number; height: number } | undefined;
      if (tool.autoSizeFromInput && sourceImages[0]) {
        const inputResolution = await getImageDimensions(sourceImages[0]);
        if (inputResolution?.width && inputResolution?.height) {
          autoSizeResolution = inputResolution;
          requestedSize = pickSizeTokenForLongEdge(
            Math.max(inputResolution.width, inputResolution.height),
          );
          requestedAspectRatio = resolveAspectRatioValue(
            AUTO_ASPECT_RATIO,
            inputResolution,
            toolModel?.supportedAspectRatios,
          );
        }
      }

      const promptWithoutAspectRatio =
        tool.id === "custom"
          ? `Edit the first image. If more images are provided, treat them as style/"like this" references.\n\nInstructions:\n${basePrompt}`
          : basePrompt;

      const usesLocalBackgroundRemoval = tool.id === "remove_background";
      const prompt = usesLocalBackgroundRemoval
        ? promptWithoutAspectRatio
        : `${promptWithoutAspectRatio}\n\n${getAspectRatioPromptHint(
            requestedAspectRatio,
            autoSizeResolution ?? targetImageResolution,
            toolModel?.supportedAspectRatios,
          )}`;
      const modelTimingKey = usesLocalBackgroundRemoval
        ? "local-background-removal"
        : envApiKey && !apiKey
          ? "default-image-model"
          : toolModel?.id || "default-image-model";
      const promptDurationKey = createPromptDurationKey(tool.id, modelTimingKey, prompt);
      const toolDurationKey = createToolDurationKey(tool.id, modelTimingKey);

      let processedImageData: string;
      // All images returned by the generation (post-processed), in order.
      // Usually length 1, but interleaved image models can return several
      // (e.g. one per comic panel). processedImageData === processedImages[0].
      let processedImages: string[] = [];
      let durationMs = 0;
      let cost = 0;
      let model = "";
      let generationText: string | null = null;
      let reasoningLevelForRequest: ModelReasoningLevel | null = null;
      let progressStartedAt = 0;
      const isBreakComic = tool.id === "break_comic_into_images";

      // Phase plan for the loading overlay. Only tools that do more than a
      // single image fetch get phases: break-comic redraws the sheet, then
      // transcribes captions, then splits it; other split-image tools generate
      // a sheet then split it. setPhase is a no-op for single-phase tools.
      const willSplitDerived =
        tool.derivedResultMode === "split-images" &&
        (tool.id !== "extract_cast_of_characters" || params.splitIntoSeparateFiles === "true");
      const phaseLabels: string[] = isBreakComic
        ? ["Editing to remove background", "Transcribing captions", "Splitting into images"]
        : willSplitDerived
          ? ["Generating sheet", "Splitting into images"]
          : [];
      const setPhase = (index: number) => {
        if (phaseLabels.length <= 1 || index < 0 || index >= phaseLabels.length) return;
        setGenerationProgress((prev) =>
          prev
            ? {
                ...prev,
                phaseLabel: phaseLabels[index],
                phaseIndex: index + 1,
                phaseCount: phaseLabels.length,
              }
            : prev,
        );
      };

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
        processedImages = [processedImageData];
        durationMs = result.durationMs;
        model = result.model;
      } else {
        const resolvedApiKey = effectiveApiKey;
        const canRunWithoutApiKey = canUseLocalDummyModelWithoutApiKey(toolModel?.id);
        if (!resolvedApiKey && !canRunWithoutApiKey) {
          setGenerationProgress(null);
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            error: "Connect to OpenRouter before running tools.",
          }));
          return;
        }

        shouldRefreshCredits = !canRunWithoutApiKey;

        // In E2E, we authenticate via an env key. In that mode we want the model
        // to be controlled by VITE_OPENROUTER_IMAGE_MODEL (from the dev server env)
        // rather than whatever the UI's default model happens to be.
        const modelIdForRequest = canRunWithoutApiKey
          ? toolModel?.id
          : envApiKey && !apiKey
            ? undefined
            : toolModel?.id;
        // Per-tool reasoning: the user's override, then the tool's hard
        // imageReasoningLevel cap (e.g. break-comic stays at the model default
        // so it doesn't "think" away its image-output budget), then the model's
        // initial level. See resolveToolReasoningLevel.
        reasoningLevelForRequest = resolveToolReasoningLevel(tool, toolModel, reasoningByTool);

        // Build image configuration from tool parameters.
        const imageConfig: ImageConfig = {
          aspectRatio: resolveAspectRatioValue(
            requestedAspectRatio,
            autoSizeResolution ?? targetImageResolution,
            toolModel?.supportedAspectRatios,
          ),
          size: requestedSize,
        };

        if (tool.autoSizeFromInput) {
          console.log("[break-comic] request size/aspect", {
            requestedSize,
            aspect: imageConfig.aspectRatio,
            inputResolution: autoSizeResolution,
          });
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
        setPhase(0);

        const result = await editImage(sourceImages, prompt, resolvedApiKey, modelIdForRequest, {
          signal: abortController.signal,
          imageConfig,
          reasoningLevel: reasoningLevelForRequest,
        });

        const returnedImages = result.images?.length ? result.images : [result.imageData];
        processedImages = await Promise.all(
          returnedImages.map((image) =>
            applyPostProcessingPipeline(image, tool.postProcessingFunctions),
          ),
        );
        processedImageData = processedImages[0];
        durationMs = result.duration;
        cost = result.cost;
        model = result.model;
        generationText = result.text ?? null;

        if (returnedImages.length > 1) {
          console.log("[break-comic] model returned multiple images", {
            toolId: tool.id,
            imagesReturned: returnedImages.length,
          });
        }

        if (isBreakComic && resolvedApiKey) {
          setPhase(1);
          // The cleanup-edit image call carries no caption JSON (and models
          // like Gemini 3.1 Flash can't return image+text in one turn), so
          // transcribe the captions from the ORIGINAL page in a separate
          // cheap text call. Reading order matches the edited sheet because
          // the edit preserves the page layout.
          const captionsResult = await generateText(
            [sourceImages[0]],
            BREAK_COMIC_CAPTIONS_PROMPT,
            resolvedApiKey,
            { signal: abortController.signal, modelId: BREAK_COMIC_TEXT_MODEL },
          );
          console.log("[break-comic] captions call result", {
            model: captionsResult.model,
            textChars: captionsResult.text.length,
            cost: captionsResult.cost,
          });
          generationText = captionsResult.text;
          durationMs += captionsResult.duration;
          cost += captionsResult.cost;
        }
      }

      // Remember what this tool/model/reasoning/size combination cost and how
      // long it took (time scales ~with price). The model indicator reuses this
      // as the estimate going forward — see ToolModelPicker.
      if (toolModel?.id) {
        const safeCost = Number.isFinite(cost) && cost > 0 ? cost : 0;
        const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
        if (safeCost > 0 || safeDuration > 0) {
          const statKey = buildMeasuredStatKey(
            tool.id,
            toolModel.id,
            reasoningLevelForRequest ?? "default",
            requestedSize,
          );
          setMeasuredStatsByKey((prev) => ({
            ...prev,
            [statKey]: { cost: safeCost, durationMs: safeDuration },
          }));
        }
      }

      const createHistoryItem = async (
        imageData: string,
        parentIdOverride?: string | null,
        extraFields?: Partial<ImageRecord>,
      ): Promise<ImageRecord> => {
        const resolution = await getImageDimensions(imageData);

        let item: ImageRecord = {
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
          ...extraFields,
        };

        if (fsBinding) {
          item = await persistHistoryImage(item);
        }

        return item;
      };

      const finalizeDerivedItems = (
        createdItems: ImageRecord[],
        options?: { showAsCollection?: boolean },
      ) => {
        const { showAsCollection = false } = options || {};
        if (progressStartedAt > 0) {
          const observedDurationMs = Math.max(1, getNowMs() - progressStartedAt);
          setGenerationTiming((prev) =>
            updateGenerationTiming(prev, promptDurationKey, toolDurationKey, observedDurationMs),
          );
        }

        setResultImageIds(showAsCollection ? createdItems.map((item) => item.id) : []);
        setGenerationProgress(null);
        setState((prev) => ({
          ...prev,
          rightPanelImageId: createdItems[0]?.id || null,
          isProcessing: false,
        }));
      };

      if (tool.derivedResultMode) {
        const shouldSplitDerivedItems =
          tool.id !== "extract_cast_of_characters" || params.splitIntoSeparateFiles === "true";
        console.log("[ExtractCast/debug] derived split decision", {
          toolId: tool.id,
          splitIntoSeparateFiles: params.splitIntoSeparateFiles,
          shouldSplitDerivedItems,
        });

        if (!shouldSplitDerivedItems) {
          throwIfCancelled();
          const newItem = await createHistoryItem(
            processedImageData,
            constrainedReferences[0]?.id || null,
          );
          appendHistoryEntry(newItem);
          setThumbnailStrips((prev) => {
            const nextCharacterIds = [
              ...(prev.itemIdsByStrip.characters || []).filter((id) => id !== newItem.id),
              newItem.id,
            ];
            const next = replaceStripItems(prev, "characters", nextCharacterIds);
            return setActiveStrip(next, "characters");
          });

          if (progressStartedAt > 0) {
            const observedDurationMs = Math.max(1, getNowMs() - progressStartedAt);
            setGenerationTiming((prev) =>
              updateGenerationTiming(prev, promptDurationKey, toolDurationKey, observedDurationMs),
            );
          }

          setGenerationProgress(null);
          setState((prev) => ({
            ...prev,
            rightPanelImageId: newItem.id,
            isProcessing: false,
          }));
          return;
        }

        // Final phase: split the generated sheet into individual images.
        setPhase(phaseLabels.length - 1);

        // Captions arrive in the generation's text channel as a JSON array, one
        // per panel in reading order. Parse them first so we can tell the
        // splitter exactly how many pieces to produce (the AI grid's connectivity
        // varies run to run, so we merge over-split fragments down to this count).
        const parsedCaptions = tool.captionsFromTextChannel
          ? parseCaptionArray(generationText)
          : null;

        // The transcriber sometimes returns the page's title/heading as the
        // first entry, ahead of the numbered panel captions. Drop it so the
        // per-panel count and index-pairing line up with the actual panels (the
        // full list, title included, still rides on the kept sheet below).
        const panelCaptions = parsedCaptions ? stripLeadingTitle(parsedCaptions) : null;

        // If the model already returned several images (e.g. Gemini 3 Pro emits
        // one image per panel instead of a single grid), use those directly as
        // the pieces. Otherwise split the single returned sheet ourselves.
        const modelReturnedMultipleImages = processedImages.length > 1;
        let imageDataItems: string[];
        if (modelReturnedMultipleImages) {
          imageDataItems = processedImages;
          console.log("[break-comic] using model's returned images as pieces (no split)", {
            toolId: tool.id,
            pieceCount: imageDataItems.length,
          });
        } else {
          const derivedItemsResult = await extractDerivedImageItems(processedImageData, {
            signal: abortController.signal,
            preferSeparatedSubjects: tool.id === "extract_cast_of_characters",
            preferComponents: tool.splitByComponents,
            // Small margin so adjacent panels stay separate: over-splitting is
            // recoverable (mergeNearestUntil collapses fragments down to the
            // known panel count) but under-splitting two fused panels usually
            // is not. See BREAK_COMIC_MERGE_MARGIN_RATIO. (Was 0.006, which
            // fused close panels.)
            componentMergeMarginRatio: tool.splitByComponents
              ? BREAK_COMIC_MERGE_MARGIN_RATIO
              : undefined,
            targetPieceCount: tool.splitByComponents
              ? (panelCaptions?.length ?? undefined)
              : undefined,
            // Break-comic asks the generator to draw magenta frames; when present
            // they drive the split directly (falls back to whitespace inference
            // if the generator didn't draw usable frames).
            detectColoredFrames: tool.splitByComponents,
          });
          durationMs += derivedItemsResult.durationMs;
          imageDataItems = derivedItemsResult.imageDataItems;
          console.log("[ExtractCast/debug] extractDerivedImageItems result", {
            toolId: tool.id,
            itemCount: imageDataItems.length,
          });
        }

        // Pieces are about to be written to history; bail if cancelled during
        // the (uninterruptible) split/segmentation above.
        throwIfCancelled();

        const parentId = constrainedReferences[0]?.id || null;

        if (tool.derivedResultMode === "split-images") {
          const createdPieces: ImageRecord[] = [];
          let sheetItem: ImageRecord | null = null;

          const pieceCount = imageDataItems.length;

          if (tool.captionsFromTextChannel) {
            console.log("[break-comic] CAPTION DIAGNOSIS", {
              modelUsed: model,
              textChannelReturned: Boolean(generationText),
              textChannelLength: generationText?.length ?? 0,
              textChannelPreview: generationText ? generationText.slice(0, 400) : null,
              parsedCaptionCount: parsedCaptions?.length ?? null,
              titleStripped: (parsedCaptions?.length ?? 0) !== (panelCaptions?.length ?? 0),
              panelCaptionCount: panelCaptions?.length ?? null,
              panelCaptionPreviews: panelCaptions?.map((c) => c.slice(0, 45)) ?? null,
              pieceCountFromSplit: pieceCount,
              countsMatch: panelCaptions?.length === pieceCount,
              splitByComponents: Boolean(tool.splitByComponents),
              modelReturnedMultipleImages,
            });
          }

          // Attach per piece ONLY when the counts match — otherwise the split
          // and the caption list disagree and index-pairing would attach text
          // to the wrong picture. When they don't match we still keep the full
          // text on the sheet (below) so it is never lost.
          let pieceCaptions: string[] = [];
          let captionPieceMismatch = false;
          if (panelCaptions && panelCaptions.length === pieceCount) {
            pieceCaptions = panelCaptions;
            console.log("[break-comic] captions from text channel", {
              pieces: pieceCount,
              withText: panelCaptions.filter((caption) => caption.trim().length > 0).length,
            });
          } else if (tool.captionsFromTextChannel && panelCaptions && panelCaptions.length > 0) {
            // The split count and the transcribed caption count disagree, so we
            // can't trust index-pairing. Keep the full text on the sheet (below)
            // and warn the user to check the pairings themselves.
            captionPieceMismatch = true;
            console.warn("[break-comic] caption/piece count mismatch — text kept on sheet only", {
              pieces: pieceCount,
              captions: panelCaptions.length,
            });
          }

          if (tool.keepDerivedSourceSheet && !modelReturnedMultipleImages) {
            // Keep the unsplit grid sheet (it carries the real generation cost
            // and appears alongside the pieces / in the Characters strip). Carry
            // the whole caption list on it so the text is recoverable even if
            // per-piece alignment failed. When the model returned separate
            // images there is no single grid sheet to keep.
            const sheetCaption =
              parsedCaptions && parsedCaptions.length ? parsedCaptions.join("\n\n") : null;
            sheetItem = await createHistoryItem(
              processedImageData,
              parentId,
              sheetCaption ? { caption: sheetCaption } : undefined,
            );
            console.log("[break-comic] sheet resolution", sheetItem.resolution);
          }

          for (let index = 0; index < imageDataItems.length; index += 1) {
            // Pieces persist to disk one at a time; stop before committing any to
            // history if the user cancelled mid-loop. (Nothing is appended to
            // history/strips until after this loop, so throwing here yields no
            // visible result.)
            throwIfCancelled();
            const pieceImage = imageDataItems[index];
            const caption = pieceCaptions[index]?.trim() || null;
            const extraFields: Partial<ImageRecord> = {};
            // Avoid double-charging. When the model returned separate images,
            // the whole generation cost lands on the first piece and the rest
            // are zeroed. When we split a single grid sheet (which carries the
            // cost) every piece is zeroed.
            const zeroPieceCost = modelReturnedMultipleImages
              ? index > 0
              : tool.keepDerivedSourceSheet;
            if (zeroPieceCost) {
              extraFields.cost = 0;
            }
            if (caption) {
              extraFields.caption = caption;
            }
            const pieceItem = await createHistoryItem(
              pieceImage,
              parentId,
              Object.keys(extraFields).length ? extraFields : undefined,
            );
            createdPieces.push(pieceItem);
          }

          // Order the pieces by the panel number in their caption ("1.", "2.",
          // …) when present, so the strip reads 1→N even if the page laid the
          // panels out in a different physical order (e.g. panel 10 sits before
          // 8 and 9). Stable: pieces without a number keep their reading-order
          // position, sorted after the numbered ones.
          if (tool.captionsFromTextChannel) {
            const ordered = createdPieces
              .map((piece, index) => ({
                piece,
                index,
                number: captionLeadingNumber(piece.caption),
              }))
              .sort((a, b) => {
                const aNumber = a.number ?? Number.POSITIVE_INFINITY;
                const bNumber = b.number ?? Number.POSITIVE_INFINITY;
                return aNumber !== bNumber ? aNumber - bNumber : a.index - b.index;
              })
              .map((entry) => entry.piece);
            createdPieces.splice(0, createdPieces.length, ...ordered);
          }

          // Enter every created record into history AND the history strip in
          // ONE synchronous block. The orphan-cleanup effect deletes history
          // entries that no strip references, and effects can run between the
          // awaits above — so an item appended to history while still awaiting
          // its siblings would be pruned before the strip insert below ever
          // ran (the pieces "vanished" after a successful generation).
          //
          // Strip order: caption order (piece 1 on the left, see sort above).
          // appendHistoryEntry prepends each item at index 0, so adding them
          // one-by-one would reverse the batch; insert the block back-to-front
          // so the first piece ends up leftmost.
          const batchItems = [...(sheetItem ? [sheetItem] : []), ...createdPieces];
          batchItems.forEach((item) => appendHistoryEntry(item, { skipHistoryStrip: true }));
          setThumbnailStrips((prev) => {
            let next = prev;
            for (let i = batchItems.length - 1; i >= 0; i -= 1) {
              next = addItemToStrip(next, "history", batchItems[i].id, 0);
            }
            return next;
          });

          if (tool.captionsFromTextChannel) {
            console.log("[break-comic] PIECES CREATED", {
              totalPieces: createdPieces.length,
              piecesWithCaption: createdPieces.filter(
                (piece) => piece.caption && piece.caption.trim().length > 0,
              ).length,
              sheetHasCaption: Boolean(sheetItem?.caption && sheetItem.caption.trim().length > 0),
            });
          }

          if (tool.id === "extract_cast_of_characters") {
            const characterStripIds = [
              ...(sheetItem ? [sheetItem.id] : []),
              ...createdPieces.map((item) => item.id),
            ];
            setThumbnailStrips((prev) => {
              const nextCharacterIds = [
                ...(prev.itemIdsByStrip.characters || []).filter(
                  (id) => !characterStripIds.includes(id),
                ),
                ...characterStripIds,
              ];
              const next = replaceStripItems(prev, "characters", nextCharacterIds);
              return setActiveStrip(next, "characters");
            });
          }

          const resultItems = sheetItem ? [sheetItem, ...createdPieces] : createdPieces;
          finalizeDerivedItems(resultItems, { showAsCollection: true });
          if (captionPieceMismatch) {
            setState((prev) => ({
              ...prev,
              error: `Heads up: this page split into ${pieceCount} image${
                pieceCount === 1 ? "" : "s"
              } but ${panelCaptions?.length ?? 0} captions were found, so the text could not be matched to individual images automatically. The full text is on the combined sheet — please check the image/text pairings carefully.`,
            }));
          }
          return;
        }

        const gifImageData = await createAnimatedGif(imageDataItems, {
          delayMs: 140,
          repeat: 0,
        });
        throwIfCancelled();
        const gifItem = await createHistoryItem(gifImageData, parentId);
        appendHistoryEntry(gifItem);
        finalizeDerivedItems([gifItem]);
        return;
      }

      throwIfCancelled();
      const newItem = await createHistoryItem(processedImageData);

      if (progressStartedAt > 0) {
        const observedDurationMs = Math.max(1, getNowMs() - progressStartedAt);
        setGenerationTiming((prev) =>
          updateGenerationTiming(prev, promptDurationKey, toolDurationKey, observedDurationMs),
        );
      }

      appendHistoryEntry(newItem);
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
          errorContent = buildInsufficientCreditsError(error.detailMessage, infoUrl);
        } else {
          errorContent = error instanceof Error ? error.message : "Failed to process image.";
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

  const handleParamChange = useCallback((toolId: string, paramName: string, value: string) => {
    setParamsByTool((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        [paramName]: value,
      },
    }));
  }, []);

  const handleUpload = useCallback(
    async (file: File, targetPanel: "target" | "right") => {
      try {
        const { dataUrl, dimensions } = await prepareImageBlob(file);
        let newItem: ImageRecord = {
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

        if (fsBinding) {
          newItem = await persistHistoryImage(newItem);
        }

        appendHistoryEntry(newItem);
        setState((prev) => ({
          ...prev,
          targetImageId: targetPanel === "target" ? newItem.id : prev.targetImageId,
          referenceImageIds:
            targetPanel === "target"
              ? prev.referenceImageIds.filter((id) => id !== newItem.id)
              : prev.referenceImageIds,
          rightPanelImageId: targetPanel === "right" ? newItem.id : prev.rightPanelImageId,
        }));
      } catch (error) {
        console.error("Failed to load image", error);
        setState((prev) => ({
          ...prev,
          error: "Could not load image. Please try again.",
        }));
      }
    },
    [fsBinding, persistHistoryImage],
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
      rightPanelImageId: prev.rightPanelImageId === id ? null : prev.rightPanelImageId,
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

        let newItem: ImageRecord = {
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

        if (fsBinding) {
          newItem = await persistHistoryImage(newItem);
        }

        appendHistoryEntry(newItem);
        setState((prev) => {
          const nextIds = [...prev.referenceImageIds];
          const idx = typeof slotIndex === "number" && slotIndex >= 0 ? slotIndex : nextIds.length;

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
    [activeToolId, fsBinding, persistHistoryImage],
  );

  // Global Paste Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (!file || !file.type.startsWith("image/")) {
        return;
      }

      const tool = activeToolId ? TOOLS.find((t) => t.id === activeToolId) : null;
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
        void handleUploadReference(file);
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
        rightPanelImageId: prev.rightPanelImageId === id ? null : prev.rightPanelImageId,
      };
    });
  };

  const handleAddReferencesAt = useCallback(
    (index: number, ids: string[]) => {
      const incomingIds = ids.filter((id) => state.history.some((item) => item.id === id));
      if (!incomingIds.length) {
        return;
      }

      const mode = getToolReferenceMode(activeToolId);
      const { max } = getReferenceConstraints(mode);

      if (max === 0) return;

      setState((prev) => {
        const filteredIds = prev.referenceImageIds.filter(
          (existingId) => !incomingIds.includes(existingId),
        );
        const insertAt = Math.min(Math.max(index, 0), filteredIds.length);
        filteredIds.splice(insertAt, 0, ...incomingIds);

        return {
          ...prev,
          referenceImageIds: filteredIds.slice(0, max),
          rightPanelImageId:
            prev.rightPanelImageId && incomingIds.includes(prev.rightPanelImageId)
              ? null
              : prev.rightPanelImageId,
        };
      });
    },
    [activeToolId, state.history],
  );

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

  const queuePreviewImage = useCallback((id: string) => {
    const nextIds = [
      ...pendingPreviewImageIdsRef.current.filter((existingId) => existingId !== id),
      id,
    ].slice(-4);
    pendingPreviewImageIdsRef.current = nextIds;
    setPreviewSelectionImageIds(nextIds);
  }, []);

  const commitPreviewSelection = useCallback(() => {
    const nextIds = pendingPreviewImageIdsRef.current.filter(
      (id, index, ids) => ids.indexOf(id) === index,
    );

    pendingPreviewImageIdsRef.current = [];
    setPreviewSelectionImageIds([]);
    if (!nextIds.length) {
      return;
    }

    setPreviewDialogImageIds(nextIds.slice(-4));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsPreviewModifierActive(true);
      }
    };

    const finishPreviewSelection = () => {
      setIsPreviewModifierActive(false);
      commitPreviewSelection();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        finishPreviewSelection();
      }
    };

    const handleWindowBlur = () => {
      finishPreviewSelection();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [commitPreviewSelection]);

  // Ctrl/Cmd+C copies the currently selected image (the one shown in the right
  // panel) to the clipboard — mirroring the per-thumbnail copy button. We defer
  // to the browser when the user is editing text or has an active text
  // selection so normal copy still works.
  useEffect(() => {
    const handleCopyShortcut = (event: KeyboardEvent) => {
      if (event.key !== "c" && event.key !== "C") return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!target?.isContentEditable;
      if (isEditable) return;

      // Let the browser handle copying highlighted text.
      const selection = typeof window !== "undefined" ? window.getSelection() : null;
      if (selection && selection.toString().length > 0) return;

      const selectedId = stateRef.current.rightPanelImageId;
      if (!selectedId) return;
      const selectedImage = stateRef.current.history.find((item) => item.id === selectedId);
      if (!selectedImage || !selectedImage.imageData) return;

      event.preventDefault();
      void copyImageRecordWithFeedback(selectedImage);
    };

    window.addEventListener("keydown", handleCopyShortcut);
    return () => {
      window.removeEventListener("keydown", handleCopyShortcut);
    };
  }, []);

  const handleSelectHistoryItem = (id: string) => {
    if (isPreviewModifierActive) {
      queuePreviewImage(id);
      return;
    }

    setResultImageIds([]);
    setState((prev) => ({ ...prev, rightPanelImageId: id }));
  };

  const handleToggleHistoryStar = useCallback((id: string) => {
    let toggled: boolean | null = null;
    setState((prev) => {
      let changed = false;
      const nextHistory = prev.history.map((item) => {
        if (item.id !== id) {
          return item;
        }
        changed = true;
        toggled = !item.isStarred;
        return { ...item, isStarred: toggled };
      });
      return changed ? { ...prev, history: nextHistory } : prev;
    });

    if (toggled === null) {
      return;
    }
    setThumbnailStrips((prev) => {
      if (toggled) {
        return addItemToStrip(prev, "starred", id);
      }
      return removeItemFromStrip(prev, "starred", id);
    });
  }, []);

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
      const exists = state.history.some((item) => item.id === draggedId);
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
    [state.history, resolvedThumbnailStripConfigs],
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

  const handleDeleteFromHistory = useCallback(
    (imageId: string) => {
      const entry = state.history.find((item) => item.id === imageId);
      if (entry) {
        void deleteHistoryImageFromFolder(entry);
      }
      setState((prev) => ({
        ...prev,
        history: prev.history.filter((item) => item.id !== imageId),
        targetImageId: prev.targetImageId === imageId ? null : prev.targetImageId,
        rightPanelImageId: prev.rightPanelImageId === imageId ? null : prev.rightPanelImageId,
        referenceImageIds: prev.referenceImageIds.filter((id) => id !== imageId),
      }));
      setResultImageIds((prev) => prev.filter((id) => id !== imageId));
      setThumbnailStrips((prev) => removeItemsFromAllStrips(prev, [imageId]));
    },
    [state.history, deleteHistoryImageFromFolder],
  );

  const handleStripRemoveItem = useCallback(
    (stripId: ThumbnailStripId, imageId: string) => {
      const config = resolvedThumbnailStripConfigs[stripId];
      if (!config.allowRemove) {
        return;
      }
      if (stripId === "history") {
        handleDeleteFromHistory(imageId);
        return;
      }

      setThumbnailStrips((prev) => removeItemFromStrip(prev, stripId, imageId));
    },
    [handleDeleteFromHistory, resolvedThumbnailStripConfigs],
  );

  const handleDismissError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  const handleToolModelChange = (toolId: string, modelId: string) => {
    setModelByTool((prev) => ({ ...prev, [toolId]: modelId }));
  };

  const handleToolReasoningChange = (toolId: string, level: ModelReasoningLevel) => {
    setReasoningByTool((prev) => ({ ...prev, [toolId]: level }));
  };

  const targetImage = state.targetImageId
    ? accessibleHistoryItems.find((h) => h.id === state.targetImageId) || null
    : null;

  const referenceItems = state.referenceImageIds
    .map((id) => accessibleHistoryItems.find((h) => h.id === id) || null)
    .filter((h): h is ImageRecord => !!h);
  const rightItem = accessibleHistoryItems.find((h) => h.id === state.rightPanelImageId) || null;
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

  // What the gauge measures: the per-key spend limit when one is set,
  // otherwise the account-level credit balance. A usage-only key (no per-key
  // limit) has no denominator of its own, so without this fallback the bar
  // would be blank.
  const creditsGauge = (() => {
    if (!credits) {
      return null;
    }
    if (credits.limit !== null && credits.limit > 0 && credits.limitRemaining !== null) {
      return {
        source: "limit" as const,
        total: credits.limit,
        remaining: credits.limitRemaining,
      };
    }
    if (
      credits.accountTotalCredits !== null &&
      credits.accountTotalCredits > 0 &&
      credits.accountRemainingCredits !== null
    ) {
      return {
        source: "account" as const,
        total: credits.accountTotalCredits,
        remaining: credits.accountRemainingCredits,
      };
    }
    return null;
  })();

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
      if (creditsGauge) {
        return `${formatCreditsValue(creditsGauge.remaining)} left`;
      }

      return `${formatCreditsValue(credits.usage)} used`;
    }
    return "--";
  })();

  const creditsSecondaryLabel =
    effectiveApiKey && credits && !creditsLoading && !creditsError
      ? creditsGauge?.source === "limit"
        ? (() => {
            const periodUsage = Math.max(0, creditsGauge.total - creditsGauge.remaining);
            const periodSuffix = credits.limitReset ? ` ${credits.limitReset}` : "";
            return `${formatCreditsValue(periodUsage)} of ${formatCreditsValue(
              creditsGauge.total,
            )} used${periodSuffix}`;
          })()
        : creditsGauge?.source === "account"
          ? `${formatCreditsValue(
              creditsGauge.total - creditsGauge.remaining,
            )} of ${formatCreditsValue(creditsGauge.total)} account credits used`
          : `${formatCreditsValue(credits.usage)} used (no limit set)`
      : null;

  const creditsTotalLabel =
    effectiveApiKey &&
    credits &&
    !creditsLoading &&
    !creditsError &&
    creditsGauge?.source === "limit"
      ? `${formatCreditsValue(credits.usage)} total`
      : null;

  const creditsTooltipLines = [
    creditsPrimaryLabel,
    creditsSecondaryLabel,
    creditsTotalLabel,
  ].filter((line): line is string => Boolean(line));

  const creditsTooltipLabel = creditsTooltipLines.join(". ") || creditsPrimaryLabel;

  const creditsProgressFraction = creditsGauge
    ? Math.min(1, Math.max(0, creditsGauge.remaining / creditsGauge.total))
    : null;

  const creditsProgressAriaProps: React.HTMLAttributes<HTMLElement> = creditsGauge
    ? {
        role: "progressbar",
        "aria-valuemin": 0,
        "aria-valuemax": creditsGauge.total,
        "aria-valuenow": creditsGauge.remaining,
      }
    : { role: "status" };

  const isCreditsLow =
    creditsGauge && !creditsError ? creditsGauge.remaining < LOW_CREDITS_THRESHOLD_USD : false;

  const creditsLabelColor = isCreditsLow ? theme.colors.danger : theme.colors.textMuted;

  const progressTrackBackground = creditsError
    ? "rgba(239, 68, 68, 0.15)"
    : isCreditsLow
      ? theme.colors.dangerSubtle
      : theme.colors.surfaceAlt;

  const progressBorderColor = isCreditsLow ? theme.colors.danger : theme.colors.border;

  const progressFillColor = creditsError
    ? "#ef4444"
    : isCreditsLow
      ? theme.colors.danger
      : theme.colors.accent;

  const shouldShowConnectToOpenRouterCTA = !effectiveApiKey && !canUseSelectedModelWithoutApiKey;
  const prototypeNoticeColor = theme.colors.accent;

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
            <Box component="img" src={bloomLogo} alt="Bloom" sx={{ width: 28, height: 28 }} />
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
                shouldShowConnectToOpenRouterCTA={shouldShowConnectToOpenRouterCTA}
                onOpenSettingsDialog={() => setIsSettingsDialogOpen(true)}
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
                    animation: fsLoading ? `${rotate360} 0.8s linear infinite` : "none",
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
              <Typography variant="caption" fontWeight={600} sx={{ color: "#ef4444" }} role="alert">
                {fsError}
              </Typography>
            )}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ImageToolsBar
            appState={state}
            modelByTool={modelByTool}
            reasoningByTool={reasoningByTool}
            measuredStatsByKey={measuredStatsByKey}
            onToolModelChange={handleToolModelChange}
            onToolReasoningChange={handleToolReasoningChange}
            targetImage={targetImage}
            referenceImages={referenceItems}
            rightImage={rightItem}
            resultImages={resultItems}
            activeToolId={activeToolId}
            toolParams={paramsByTool}
            historyItems={state.history}
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
            onVisibleStripItemIdsChange={handleVisibleStripItemIdsChange}
            onApplyTool={handleApplyTool}
            onCancelProcessing={handleCancelProcessing}
            onToolSelect={handleToolSelectWithConstraints}
            onParamChange={handleParamChange}
            selectedArtStyleId={selectedArtStyleId}
            onArtStyleChange={handleArtStyleChange}
            onSetTarget={handleSetTargetImage}
            onSetReferenceAt={handleSetReferenceAt}
            onAddReferencesAt={handleAddReferencesAt}
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
            previewModifierActive={isPreviewModifierActive}
            previewSelectionImageIds={previewSelectionImageIds}
            onDismissError={handleDismissError}
          />
        </Box>

        <Box
          component="footer"
          sx={{
            px: 3,
            py: 1.5,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 52,
            backgroundColor: "rgba(15, 23, 42, 0.52)",
            color: theme.colors.textMuted,
            textAlign: "center",
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.4, maxWidth: 720 }}>
            💡Tip: To compare images, hold down the control key while clicking one or more of them.
          </Typography>
        </Box>

        <ImagePreviewDialog
          open={previewDialogImages.length > 0}
          images={previewDialogImages}
          onClose={() => {
            setPreviewSelectionImageIds([]);
            setPreviewDialogImageIds([]);
          }}
        />

        <OpenRouterWelcomeDialog
          isOpen={isWelcomeDialogOpen}
          onConnect={() => {
            setIsWelcomeDialogOpen(false);
            setIsSettingsDialogOpen(true);
          }}
          onDismiss={() => setIsWelcomeDialogOpen(false)}
        />

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
            directoryName: fsBinding?.directoryName ?? null,
            error: fsError,
            onEnableFolder: () => {
              void handleEnableFolderStorage();
            },
            onDisableFolder: () => {
              void handleDisableFolderStorage();
            },
          }}
        />
      </Box>
    </ThemeProvider>
  );
}

export default ImageToolsWorkspace;
