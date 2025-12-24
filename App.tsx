import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import {
  AppState,
  HistoryItem,
  ImageToolsStatePersistence,
  ModelInfo,
  PersistedAppState,
  ToolParamsById,
} from "./types";
import { ImageToolsPanel } from "./components/ImageToolsPanel";
import {
  editImage,
  fetchOpenRouterCredits,
  OpenRouterApiError,
  OPENROUTER_KEYS_URL,
  OpenRouterCredits,
  ImageConfig,
} from "./services/openRouterService";
import { TOOLS } from "./components/tools/tools-registry";
import { theme } from "./themes";
import { darkTheme } from "./components/materialUITheme";
import { handleOAuthCallback, initiateOAuthFlow } from "./lib/openRouterOAuth";
import JSON5 from "json5";
import modelCatalogText from "./data/models-registry.json5?raw";
import { ModelChooserDialog } from "./components/ModelChooserDialog";
import { AIImageToolsSettingsDialog } from "./components/AIImageToolsSettingsDialog";
import { Icon, Icons } from "./components/Icons";
import bloomLogo from "./assets/bloom.svg";
import {
  createToolParamDefaults,
  mergeParamsWithDefaults,
} from "./components/tools/toolParams";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";
import {
  API_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
} from "./lib/authStorage";
import { createBrowserImageToolsPersistence } from "./services/persistence/browserPersistence";
import {
  IMAGE_TOOLS_STATE_VERSION,
  LOCAL_HISTORY_CACHE_LIMIT,
} from "./services/persistence/constants";
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
} from "./services/persistence/fileSystemAccess";
import {
  isClearArtStyleId,
  getStyleIdFromParams,
  getStyleIdFromHistoryItem,
} from "./lib/artStyles";
import {
  getImageDimensions,
  getMimeTypeFromUrl,
  prepareImageBlob,
} from "./lib/imageUtils";
import {
  getReferenceConstraints,
  getToolReferenceMode,
} from "./lib/toolHelpers";
import { formatCreditsValue, formatSourceSummary } from "./lib/formatters";
import { applyPostProcessingPipeline } from "./lib/postProcessing";

// Helper to create UUIDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// Only use the E2E test key - this should only be set during Playwright tests
const ENV_API_KEY = (process.env.E2E_OPENROUTER_API_KEY || "").trim();
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

const getEnvApiKey = (): string => {
  if (!ENV_API_KEY) return "";
  if (typeof window === "undefined") return ENV_API_KEY;
  return window.sessionStorage?.getItem(ENV_KEY_SKIP_FLAG) === "1"
    ? ""
    : ENV_API_KEY;
};

const sanitizePersistedAppState = (
  persisted: PersistedAppState | null | undefined
): PersistedAppState => {
  const history = Array.isArray(persisted?.history)
    ? (persisted?.history as HistoryItem[])
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

export default function App() {
  const [state, setState] = useState<AppState>({
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: null,
    history: [],
    isProcessing: false,
    isAuthenticated: false,
    error: null,
  });

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
  const browserPersistence = useMemo(
    () => createBrowserImageToolsPersistence(),
    []
  );
  const persistence: ImageToolsStatePersistence = browserPersistence;
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
  const envApiKey = getEnvApiKey();
  const effectiveApiKey = apiKey || envApiKey;
  const usingEnvKey = !!(envApiKey && !apiKey);
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
      item: HistoryItem,
      bindingOverride?: FileSystemImageBinding | null
    ): Promise<HistoryItem> => {
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
        console.error("Failed to save history image", error);
        setFsError("Could not save image to folder.");
        return item;
      }
    },
    [fsBinding]
  );

  const loadHistoryImageFromFolder = useCallback(
    async (item: HistoryItem): Promise<HistoryItem> => {
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
    async (item: HistoryItem) => {
      if (!fsBinding || !item.imageFileName) {
        return;
      }
      await deleteImageFile(fsBinding, item.imageFileName);
    },
    [fsBinding]
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
      const updateMap = new Map<string, HistoryItem>(
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
      .filter((h): h is HistoryItem => !!h);

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
          .map((item) => getStyleIdFromHistoryItem(item))
          .find((styleId): styleId is string => Boolean(styleId)) || null;
      const derivedSourceStyleId =
        getStyleIdFromParams(params) ||
        getStyleIdFromHistoryItem(targetImage) ||
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

      let newItem: HistoryItem = {
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
      };

      if (fsBinding) {
        newItem = await persistHistoryImage(newItem);
      }

      setState((prev) => ({
        ...prev,
        history: [...prev.history, newItem],
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
        let newItem: HistoryItem = {
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
        };

        if (fsBinding) {
          newItem = await persistHistoryImage(newItem);
        }

        setState((prev) => ({
          ...prev,
          history: [...prev.history, newItem],
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

        let newItem: HistoryItem = {
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
        };

        if (fsBinding) {
          newItem = await persistHistoryImage(newItem);
        }

        setState((prev) => {
          const nextHistory = [...prev.history, newItem];
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
            history: nextHistory,
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

  const handleRemoveHistoryItem = (id: string) => {
    const item = state.history.find((h) => h.id === id);
    if (item) {
      void deleteHistoryImageFromFolder(item);
    }
    setState((prev) => ({
      ...prev,
      history: prev.history.filter((h) => h.id !== id),
      referenceImageIds: prev.referenceImageIds.filter((refId) => refId !== id),
      targetImageId: prev.targetImageId === id ? null : prev.targetImageId,
      rightPanelImageId:
        prev.rightPanelImageId === id ? null : prev.rightPanelImageId,
    }));
  };

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
    .filter((h): h is HistoryItem => !!h);
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

  const creditsTooltipLines = [creditsPrimaryLabel, creditsSecondaryLabel]
    .filter((line): line is string => Boolean(line));

  const creditsTooltipLabel =
    creditsTooltipLines.join(". ") || creditsPrimaryLabel;

  const creditsProgressFraction =
    credits && credits.totalCredits > 0
      ? Math.min(
          1,
          Math.max(0, credits.remainingCredits / credits.totalCredits)
        )
      : null;

  const creditsProgressAriaProps: React.AriaAttributes =
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

  const progressFillGradient = creditsError
    ? "linear-gradient(90deg, #ef4444, #f87171)"
    : isCreditsLow
    ? `linear-gradient(90deg, ${theme.colors.danger}, ${theme.colors.dangerHover})`
    : `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.accentHover})`;

  const shouldShowConnectToOpenRouterCTA = !effectiveApiKey;

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <div
        className="flex flex-col h-screen font-sans"
        style={{
          backgroundColor: theme.colors.appBackground,
          color: theme.colors.textPrimary,
        }}
      >
      {/* Header */}
      <header
        className="h-16 border-b flex items-center justify-between px-6 z-30 shadow-md"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          boxShadow: theme.colors.panelShadow,
        }}
      >
        <div className="flex items-center gap-3">
          <img src={bloomLogo} alt="Bloom" className="h-7 w-7" />
          <h1 className="text-lg font-bold bg-clip-text ">
            Bloom AI Image Tools
          </h1>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-4">
            {shouldShowConnectToOpenRouterCTA ? (
              <button
                type="button"
                onClick={() => setIsSettingsDialogOpen(true)}
                className="px-6 py-2.5 rounded-3xl text-sm font-semibold tracking-widest uppercase shadow-lg transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  color: theme.colors.surface,
                  borderColor: theme.colors.accent,
                  backgroundImage: `linear-gradient(120deg, ${theme.colors.accent}, ${theme.colors.accentHover})`,
                  boxShadow: theme.colors.accentShadow,
                }}
              >
                Connect to OpenRouter
              </button>
            ) : (
              <div
                className="text-right leading-tight relative group focus:outline-none"
                tabIndex={0}
                aria-label={creditsTooltipLabel}
                style={{ cursor: "default" }}
              >
                <span
                  className="block text-xs font-semibold uppercase tracking-wide"
                  style={{ color: creditsLabelColor }}
                >
                  OpenRouter Credits
                </span>
                <div className="mt-1 flex flex-col items-end gap-1">
                  <div
                    className="w-40 h-2.5 rounded-full overflow-hidden border"
                    style={{
                      borderColor: progressBorderColor,
                      backgroundColor: progressTrackBackground,
                    }}
                    {...creditsProgressAriaProps}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-200 ease-out"
                      style={{
                        backgroundImage: progressFillGradient,
                        width: `${Math.max(
                          0,
                          Math.min(100, (creditsProgressFraction ?? 0) * 100)
                        )}%`,
                        opacity: creditsProgressFraction !== null ? 1 : 0.35,
                      }}
                    />
                  </div>
                </div>
                {creditsTooltipLines.length > 0 && (
                  <div
                    className="absolute top-full right-0 mt-2 px-3 py-2 rounded-lg text-xs shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-150 pointer-events-none border"
                    style={{
                      borderColor: progressBorderColor,
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                    }}
                  >
                    {creditsTooltipLines.map((line, index) => (
                      <div key={`credits-tooltip-${index}`}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedModel && (
              <button
                type="button"
                onClick={() => setIsModelDialogOpen(true)}
                className="px-5 py-2 rounded-2xl border font-semibold text-sm tracking-wide"
                style={{
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                  boxShadow: theme.colors.panelShadow,
                  color: theme.colors.textPrimary,
                }}
              >
                Model: {selectedModel.name}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSettingsDialogOpen(true)}
              className="relative p-2 rounded-full border hover:opacity-80 transition-opacity"
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                boxShadow: theme.colors.panelShadow,
                color: theme.colors.textPrimary,
              }}
              title={settingsButtonTitle}
              aria-label={settingsButtonLabel}
            >
              <Icon
                path={Icons.Gear}
                className={`w-4 h-4 ${fsLoading ? "animate-spin" : ""}`}
              />
              {isFolderPersistenceActive && (
                <span
                  className="absolute top-1 right-1 block w-2 h-2 rounded-full"
                  style={{ backgroundColor: theme.colors.accent }}
                />
              )}
            </button>
          </div>
          {fsError && (
            <span
              className="text-xs font-semibold"
              style={{ color: "#ef4444" }}
              role="alert"
            >
              {fsError}
            </span>
          )}
        </div>
      </header>

      <ImageToolsPanel
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
        onRemoveHistoryItem={handleRemoveHistoryItem}
        onDismissError={handleDismissError}
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

      <ModelChooserDialog
        isOpen={isModelDialogOpen}
        models={MODEL_CATALOG}
        selectedModelId={selectedModel?.id || ""}
        onSelect={handleSelectModel}
        onClose={() => setIsModelDialogOpen(false)}
      />
      </div>
    </ThemeProvider>
  );
}
