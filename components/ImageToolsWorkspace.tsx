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
  ImageRecord,
  ImageToolsStatePersistence,
  ModelInfo,
  PersistedAppState,
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
import JSON5 from "json5";
import modelCatalogText from "../data/models-registry.json5";
import { ModelChooserDialog } from "./ModelChooserDialog";
import { AIImageToolsSettingsDialog } from "./AIImageToolsSettingsDialog";
import { Icons } from "./Icons";
import bloomLogo from "../assets/bloom.svg";
import {
  createToolParamDefaults,
  mergeParamsWithDefaults,
} from "./tools/toolParams";
import {
  API_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
} from "../lib/authStorage";
import {
  IMAGE_TOOLS_STATE_VERSION,
  LOCAL_HISTORY_CACHE_LIMIT,
} from "../services/persistence/constants";
import {
  FileSystemImageBinding,
  deleteImageFile,
  deriveImageFileName,
  forgetFileSystemImageBinding,
  readImageFile,
  requestFileSystemImageBinding,
  restoreFileSystemImageBinding,
  supportsFileSystemAccess,
  writeImageFile,
} from "../services/persistence/fileSystemAccess";
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
import { applyPostProcessingPipeline } from "../lib/postProcessing";
import {
  addItemToStrip,
  createDefaultThumbnailStripsSnapshot,
  hydrateThumbnailStripsSnapshot,
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

const MODEL_CATALOG: ModelInfo[] = (() => {
  try {
    const parsed = JSON5.parse(modelCatalogText);
    return Array.isArray(parsed) ? (parsed as ModelInfo[]) : [];
  } catch (err) {
    console.error("Failed to parse model registry (JSON5)", err);
    return [];
  }
})();
const DEFAULT_MODEL =
  MODEL_CATALOG.find((model) => model.default) || MODEL_CATALOG[0] || null;

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
  url: string
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
  url: string
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

const sanitizePersistedAppState = (
  persisted: PersistedAppState | null | undefined
): PersistedAppState => {
  const history = Array.isArray(persisted?.history)
    ? (persisted?.history as ImageRecord[])
    : [];
  const accessibleIds = new Set(
    history.filter((item) => !!item.imageData).map((item) => item.id)
  );

  const normalizeId = (id: string | null) =>
    id && accessibleIds.has(id) ? id : null;
  const referenceImageIds = Array.isArray(persisted?.referenceImageIds)
    ? (persisted?.referenceImageIds as string[]).filter((id) =>
        accessibleIds.has(id)
      )
    : [];

  return {
    targetImageId: normalizeId(persisted?.targetImageId ?? null),
    referenceImageIds,
    rightPanelImageId: normalizeId(persisted?.rightPanelImageId ?? null),
    history,
  };
};
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
  const [thumbnailStrips, setThumbnailStrips] =
    useState<ThumbnailStripsSnapshot>(() =>
      createDefaultThumbnailStripsSnapshot()
    );

  const resolvedThumbnailStripConfigs = useMemo(
    () => resolveThumbnailStripConfigs(thumbnailStripConfigOverrides),
    [thumbnailStripConfigOverrides]
  );

  const [paramsByTool, setParamsByTool] = useState<ToolParamsById>(() =>
    createToolParamDefaults()
  );
  const [selectedArtStyleId, setSelectedArtStyleId] = useState<string | null>(
    null
  );
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"oauth" | "manual" | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    DEFAULT_MODEL?.id || ""
  );
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [credits, setCredits] = useState<OpenRouterCredits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [fsBinding, setFsBinding] = useState<FileSystemImageBinding | null>(
    null
  );
  const [fsLoading, setFsLoading] = useState(false);
  const [fsError, setFsError] = useState<string | null>(null);
  const [fsSupported, setFsSupported] = useState(() =>
    supportsFileSystemAccess()
  );
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
  const isFolderPersistenceActive = !!fsBinding;
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
      bindingOverride?: FileSystemImageBinding | null
    ): Promise<ImageRecord> => {
      const bindingToUse = bindingOverride ?? fsBinding;
      if (!bindingToUse || !item.imageData) {
        return item;
      }
      try {
        const mime = getMimeTypeFromUrl(item.imageData) ?? "image/png";
        const fileName = item.imageFileName
          ? item.imageFileName
          : deriveImageFileName(item.id, mime);
        await writeImageFile(bindingToUse, fileName, item.imageData);
        return { ...item, imageFileName: fileName };
      } catch (error) {
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
            getMimeTypeFromUrl(item.imageData) ?? "image/png"
          ),
          error: errorDetails,
        });
        setFsError("Could not save image to folder.");
        return item;
      }
    },
    [fsBinding]
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
      return { ...item, imageData: dataUrl };
    },
    [fsBinding]
  );

  const deleteHistoryImageFromFolder = useCallback(
    async (item: ImageRecord) => {
      if (!fsBinding || !item.imageFileName) {
        return;
      }
      await deleteImageFile(fsBinding, item.imageFileName);
    },
    [fsBinding]
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
    []
  );

  const updateAllArtStyleParams = useCallback(
    (styleId: string) => {
      setParamsByTool((prev) => {
        let mutated = false;
        const next: ToolParamsById = { ...prev };

        TOOLS.forEach((tool) => {
          const artStyleParams = tool.parameters.filter(
            (param) => param.type === "art-style"
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
    [setParamsByTool]
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
    [updateAllArtStyleParams]
  );

  useEffect(() => {
    setFsSupported(supportsFileSystemAccess());
  }, []);

  useEffect(() => {
    const resolvedIds = resolvedEnvironmentEntries.map((entry) => entry.id);

    if (environmentStripMode === "host") {
      if (!resolvedEnvironmentEntries.length) {
        setThumbnailStrips((prev) =>
          replaceStripItems(prev, "environment", [])
        );
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

      setThumbnailStrips((prev) =>
        replaceStripItems(prev, "environment", resolvedIds)
      );

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
      (thumbnailStrips.itemIdsByStrip[stripId] || []).forEach((id) =>
        referencedIds.add(id)
      );
    });
    if (state.targetImageId) {
      referencedIds.add(state.targetImageId);
    }
    state.referenceImageIds.forEach((id) => referencedIds.add(id));
    if (state.rightPanelImageId) {
      referencedIds.add(state.rightPanelImageId);
    }

    const orphaned = state.history.filter(
      (entry) => entry.origin !== "environment" && !referencedIds.has(entry.id)
    );
    if (!orphaned.length) {
      return;
    }

    orphaned.forEach((entry) => {
      void deleteHistoryImageFromFolder(entry);
    });

    setState((prev) => ({
      ...prev,
      history: prev.history.filter(
        (entry) => entry.origin === "environment" || referencedIds.has(entry.id)
      ),
      referenceImageIds: prev.referenceImageIds.filter((id) =>
        referencedIds.has(id)
      ),
      targetImageId:
        prev.targetImageId && referencedIds.has(prev.targetImageId)
          ? prev.targetImageId
          : null,
      rightPanelImageId:
        prev.rightPanelImageId && referencedIds.has(prev.rightPanelImageId)
          ? prev.rightPanelImageId
          : null,
    }));
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

  useEffect(() => {
    if (!isHydrated || !fsBinding) {
      return;
    }

    const itemsNeedingData = state.history.filter(
      (item) => !item.imageData && !!item.imageFileName
    );
    if (itemsNeedingData.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      const updatedItems = await Promise.all(
        itemsNeedingData.map((item) => loadHistoryImageFromFolder(item))
      );
      if (cancelled) {
        return;
      }
      const updateMap = new Map<string, ImageRecord>(
        updatedItems.map((item) => [item.id, item])
      );
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
    })();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, fsBinding, state.history, loadHistoryImageFromFolder]);

  useEffect(() => {
    if (!fsSupported) {
      return;
    }

    let cancelled = false;
    (async () => {
      const binding = await restoreFileSystemImageBinding();
      if (!cancelled && binding) {
        setFsBinding(binding);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fsSupported]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const persisted = await persistence.load();
        if (cancelled) {
          return;
        }

        if (persisted) {
          const sanitized = sanitizePersistedAppState(persisted.appState);
          if (cancelled) return;
          setState((prev) => ({
            ...prev,
            ...sanitized,
            isProcessing: false,
            error: null,
          }));

          const hydratedStrips = hydrateThumbnailStripsSnapshot(
            persisted.thumbnailStrips,
            sanitized.history
          );
          if (!cancelled) {
            setThumbnailStrips(hydratedStrips);
          }

          const mergedParams = mergeParamsWithDefaults(persisted.paramsByTool);
          if (cancelled) return;
          setParamsByTool(mergedParams);
          setActiveToolId(persisted.activeToolId ?? null);

          const persistedStyleId =
            typeof persisted.selectedArtStyleId === "string" &&
            persisted.selectedArtStyleId.trim().length
              ? persisted.selectedArtStyleId
              : null;

          if (!cancelled) {
            const fallbackStyleId =
              Object.values(mergedParams)
                .map((params) => getStyleIdFromParams(params))
                .find((styleId): styleId is string => Boolean(styleId)) || null;
            const resolvedStyleId = persistedStyleId || fallbackStyleId;
            if (resolvedStyleId) {
              setSelectedArtStyleId(resolvedStyleId);
              updateAllArtStyleParams(resolvedStyleId);
            }
          }

          if (
            persisted.selectedModelId &&
            MODEL_CATALOG.some(
              (model) => model.id === persisted.selectedModelId
            )
          ) {
            setSelectedModelId(persisted.selectedModelId);
          }
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
  }, [persistence, envApiKey, updateAllArtStyleParams]);

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

  const persistableState = useMemo(() => {
    const cacheStart = Math.max(
      state.history.length - LOCAL_HISTORY_CACHE_LIMIT,
      0
    );
    const historyForPersistence = state.history.map((item, index) => {
      const keepImageData =
        !fsBinding ||
        !item.imageFileName ||
        !item.imageData ||
        index >= cacheStart;
      if (keepImageData) {
        return item;
      }
      return { ...item, imageData: "" };
    });

    return {
      version: IMAGE_TOOLS_STATE_VERSION,
      appState: {
        targetImageId: state.targetImageId,
        referenceImageIds: state.referenceImageIds,
        rightPanelImageId: state.rightPanelImageId,
        history: historyForPersistence,
      },
      paramsByTool,
      activeToolId,
      selectedModelId: selectedModelId || null,
      selectedArtStyleId: selectedArtStyleId ?? null,
      auth: {
        apiKey,
        authMethod,
      },
      thumbnailStrips,
    };
  }, [
    state.targetImageId,
    state.referenceImageIds,
    state.rightPanelImageId,
    state.history,
    fsBinding,
    paramsByTool,
    activeToolId,
    selectedModelId,
    selectedArtStyleId,
    apiKey,
    authMethod,
    thumbnailStrips,
  ]);

  const accessibleHistoryItems = useMemo(
    () => state.history.filter((item) => !!item.imageData),
    [state.history]
  );

  const hasHiddenHistory = useMemo(() => {
    if (fsBinding || !fsSupported) {
      return false;
    }
    return state.history.some(
      (item) => !item.imageData && !!item.imageFileName
    );
  }, [fsBinding, fsSupported, state.history]);

  useEffect(() => {
    if (!isHydrated || !persistence) return;
    void persistence.save(persistableState);
  }, [persistence, persistableState, isHydrated]);

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
      const migratedHistory = await Promise.all(
        state.history.map((item) => persistHistoryImage(item, binding))
      );
      const migratedMap = new Map(
        migratedHistory.map((item) => [item.id, item] as const)
      );
      setFsBinding(binding);
      setState((prev) => ({
        ...prev,
        history: prev.history.map((item) => migratedMap.get(item.id) ?? item),
      }));
    } catch (error) {
      console.error("Failed to enable folder storage", error);
      setFsError("Could not enable folder storage.");
    } finally {
      setFsLoading(false);
    }
  }, [fsSupported, state.history, persistHistoryImage]);

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
        })
      );
      const restoredMap = new Map(
        restoredHistory.map((item) => [item.id, item] as const)
      );
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
    setState((prev) => ({ ...prev, isProcessing: false }));
  }, []);

  const handleApplyTool = async (
    toolId: string,
    params: Record<string, string>
  ) => {
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

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
        error:
          "Please add a reference image for this tool (drag from history or upload).",
      }));
      return;
    }

    if (state.isProcessing) return;

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
        referenceImageCount
      );
      const sourceImages = [
        ...(requiresEditImage && targetImage ? [targetImage.imageData] : []),
        ...constrainedReferences.map((h) => h.imageData),
      ];

      const prompt =
        tool.id === "custom"
          ? `Edit the first image. If more images are provided, treat them as style/"like this" references.\n\nInstructions:\n${basePrompt}`
          : basePrompt;

      const resolvedApiKey = effectiveApiKey;
      if (!resolvedApiKey) {
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

      // Build image configuration from tool parameters (shape/size)
      const imageConfig: ImageConfig = {
        shape: params.shape,
        size: params.size,
      };

      const result = await editImage(
        sourceImages,
        prompt,
        resolvedApiKey,
        modelIdForRequest,
        { signal: abortController.signal, imageConfig }
      );

      const processedImageData = await applyPostProcessingPipeline(
        result.imageData,
        tool.postProcessingFunctions
      );

      const resolution = await getImageDimensions(processedImageData);

      let newItem: ImageRecord = {
        id: uuid(),
        parentId:
          requiresEditImage && targetImage
            ? targetImage.id
            : constrainedReferences[0]?.id || null,
        imageData: processedImageData,
        toolId: tool.id,
        parameters: params,
        durationMs: result.duration,
        cost: result.cost,
        model: result.model,
        timestamp: Date.now(),
        promptUsed: prompt,
        sourceStyleId: derivedSourceStyleId,
        sourceSummary,
        resolution,
        isStarred: false,
      };

      if (fsBinding) {
        newItem = await persistHistoryImage(newItem);
      }

      appendHistoryEntry(newItem);
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
            infoUrl
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
    []
  );

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
    [fsBinding, persistHistoryImage]
  );

  const handleUploadTarget = useCallback(
    (file: File) => {
      void handleUpload(file, "target");
    },
    [handleUpload]
  );
  const handleUploadRight = useCallback(
    (file: File) => {
      void handleUpload(file, "right");
    },
    [handleUpload]
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
    [activeToolId, fsBinding, persistHistoryImage]
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
    setState((prev) => ({ ...prev, rightPanelImageId: id }));
  };

  const handleRemoveReferenceAt = (index: number) => {
    setState((prev) => ({
      ...prev,
      referenceImageIds: prev.referenceImageIds.filter((_, i) => i !== index),
    }));
  };

  const handleClearRightPanel = () => {
    setState((prev) => ({ ...prev, rightPanelImageId: null }));
  };

  const handleSelectHistoryItem = (id: string) => {
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
      _event?: React.DragEvent
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
    [state.history, resolvedThumbnailStripConfigs]
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
        const entry = state.history.find((item) => item.id === imageId);
        if (entry?.isStarred) {
          handleToggleHistoryStar(imageId);
        }
        return;
      }

      setThumbnailStrips((prev) => removeItemFromStrip(prev, stripId, imageId));
    },
    [handleToggleHistoryStar, state.history, resolvedThumbnailStripConfigs]
  );

  const handleDismissError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
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
          credits.totalCredits
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
          Math.max(0, credits.remainingCredits / credits.totalCredits)
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
            height: 64,
            borderBottom: `1px solid ${theme.colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: "24px",
            boxShadow: theme.colors.panelShadow,
            zIndex: 30,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              component="img"
              src={bloomLogo}
              alt="Bloom"
              sx={{ width: 28, height: 28 }}
            />
            <Typography variant="h6" component="h1" fontWeight={700}>
              Bloom AI Image Tools
            </Typography>
          </Stack>

          <Stack spacing={1} alignItems="flex-end">
            <Stack direction="row" spacing={3} alignItems="center">
              {shouldShowConnectToOpenRouterCTA ? (
                <Button
                  type="button"
                  onClick={() => setIsSettingsDialogOpen(true)}
                  variant="contained"
                  disableElevation
                  sx={{
                    px: 3,
                    py: 1.25,
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    backgroundColor: theme.colors.accent,
                    color: theme.colors.surface,
                    boxShadow: theme.colors.accentShadow,
                    transition:
                      "transform 150ms ease, background-color 150ms ease",
                    "&:hover": {
                      transform: "translateY(-2px)",
                      backgroundColor: theme.colors.accentHover,
                    },
                  }}
                >
                  Connect to OpenRouter
                </Button>
              ) : (
                <Box
                  tabIndex={0}
                  aria-label={creditsTooltipLabel}
                  sx={{
                    position: "relative",
                    textAlign: "right",
                    lineHeight: 1.2,
                    cursor: "default",
                    outline: "none",
                    "&:hover [data-role='credits-tooltip'], &:focus-within [data-role='credits-tooltip']":
                      {
                        opacity: 1,
                      },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: creditsLabelColor,
                      display: "block",
                    }}
                  >
                    OpenRouter Credits
                  </Typography>
                  <Stack spacing={0.75} alignItems="flex-end" mt={0.5}>
                    <Box
                      sx={{
                        width: 160,
                        height: 10,
                        borderRadius: 999,
                        overflow: "hidden",
                        border: `1px solid ${progressBorderColor}`,
                        backgroundColor: progressTrackBackground,
                      }}
                      {...creditsProgressAriaProps}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          borderRadius: 999,
                          transition: "width 200ms ease",
                          backgroundColor: progressFillColor,
                          width: `${Math.max(
                            0,
                            Math.min(100, (creditsProgressFraction ?? 0) * 100)
                          )}%`,
                          opacity: creditsProgressFraction !== null ? 1 : 0.35,
                        }}
                      />
                    </Box>
                  </Stack>
                  {creditsTooltipLines.length > 0 && (
                    <Box
                      data-role="credits-tooltip"
                      sx={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        px: 1.25,
                        py: 1,
                        borderRadius: 1,
                        fontSize: "0.75rem",
                        boxShadow: theme.colors.panelShadow,
                        whiteSpace: "nowrap",
                        transition: "opacity 150ms ease",
                        opacity: 0,
                        pointerEvents: "none",
                        border: `1px solid ${progressBorderColor}`,
                        backgroundColor: theme.colors.surface,
                        color: theme.colors.textPrimary,
                      }}
                    >
                      {creditsTooltipLines.map((line, index) => (
                        <div key={`credits-tooltip-${index}`}>{line}</div>
                      ))}
                    </Box>
                  )}
                </Box>
              )}
              {selectedModel && (
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => setIsModelDialogOpen(true)}
                  sx={{
                    borderRadius: "999px",
                    fontWeight: 600,
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
            appState={state}
            selectedModel={selectedModel || null}
            targetImage={targetImage}
            referenceImages={referenceItems}
            rightImage={rightItem}
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

        <ModelChooserDialog
          isOpen={isModelDialogOpen}
          models={MODEL_CATALOG}
          selectedModelId={selectedModel?.id || ""}
          onSelect={handleSelectModel}
          onClose={() => setIsModelDialogOpen(false)}
        />
      </Box>
    </ThemeProvider>
  );
}

export default ImageToolsWorkspace;
