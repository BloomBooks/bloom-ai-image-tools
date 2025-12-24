import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
} from "./services/openRouterService";
import { TOOLS } from "./components/tools/tools-registry";
import { theme } from "./themes";
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
import { isClearArtStyleId } from "./lib/artStyles";

// Helper to create UUIDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// Helper to extract image dimensions from a data URL
const getImageDimensions = (
  dataUrl: string
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = dataUrl;
  });
};

const getDataUrlMime = (dataUrl: string | null | undefined): string | null => {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/[^;]+);/i);
  return match ? match[1].toLowerCase() : null;
};

const formatCreditsValue = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const formatSourceSummary = (
  editImageCount: number,
  referenceImageCount: number
): string | null => {
  const normalizedEdit = Math.max(0, editImageCount);
  const normalizedReference = Math.max(0, referenceImageCount);
  const parts: string[] = [];

  if (normalizedEdit > 0) {
    const label = normalizedEdit === 1 ? "image" : "images";
    parts.push(`${normalizedEdit} ${label} to edit`);
  }

  if (normalizedReference > 0) {
    const label = normalizedReference === 1 ? "reference image" : "reference images";
    parts.push(`${normalizedReference} ${label}`);
  }

  if (!parts.length) {
    return null;
  }

  if (parts.length === 1) {
    return `Included ${parts[0]}.`;
  }

  const summary = `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Included ${summary}.`;
};

const STYLE_PARAM_KEY = "styleId";

const normalizeStyleIdValue = (value?: string | null): string | null => {
  if (!value || isClearArtStyleId(value)) {
    return null;
  }
  return value;
};

const getStyleIdFromParams = (
  params?: Record<string, string>
): string | null => {
  if (!params) return null;
  const hasKey = Object.prototype.hasOwnProperty.call(params, STYLE_PARAM_KEY);
  if (!hasKey) {
    return null;
  }
  const raw = (params as Record<string, string | undefined>)[STYLE_PARAM_KEY];
  return normalizeStyleIdValue(raw ?? null);
};

const getStyleIdFromHistoryItem = (
  item?: HistoryItem | null
): string | null => {
  if (!item) return null;
  return (
    normalizeStyleIdValue(item.sourceStyleId ?? null) ||
    getStyleIdFromParams(item.parameters)
  );
};

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
        const mime = getDataUrlMime(item.imageData) ?? "image/png";
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

  useEffect(() => {
    setFsSupported(supportsFileSystemAccess());
  }, []);

  const getReferenceConstraints = (
    mode: "0" | "0+" | "1" | "1+"
  ): { min: number; max: number } => {
    switch (mode) {
      case "0":
        return { min: 0, max: 0 };
      case "0+":
        return { min: 0, max: Number.POSITIVE_INFINITY };
      case "1":
        return { min: 1, max: 1 };
      case "1+":
        return { min: 1, max: Number.POSITIVE_INFINITY };
    }
  };

  const getToolReferenceMode = (toolId: string | null) => {
    const tool = toolId ? TOOLS.find((t) => t.id === toolId) : null;
    return tool?.referenceImages ?? "0";
  };

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
      const updateMap = new Map(updatedItems.map((item) => [item.id, item]));
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
          setState((prev) => ({
            ...prev,
            ...sanitized,
            isProcessing: false,
            error: null,
          }));
          setParamsByTool(mergeParamsWithDefaults(persisted.paramsByTool));
          setActiveToolId(persisted.activeToolId ?? null);
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
  }, [persistence, envApiKey]);

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

      const result = await editImage(
        sourceImages,
        prompt,
        resolvedApiKey,
        modelIdForRequest,
        { signal: abortController.signal }
      );

      const resolution = await getImageDimensions(result.imageData);

      let newItem: HistoryItem = {
        id: uuid(),
        parentId:
          requiresEditImage && targetImage
            ? targetImage.id
            : constrainedReferences[0]?.id || null,
        imageData: result.imageData,
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
    (file: File, targetPanel: "target" | "right") => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const resolution = await getImageDimensions(base64);
        let newItem: HistoryItem = {
          id: uuid(),
          parentId: null,
          imageData: base64,
          toolId: "original",
          parameters: {},
          sourceStyleId: null,
          durationMs: 0,
          cost: 0,
          model: "",
          timestamp: Date.now(),
          promptUsed: "Original Upload",
          resolution,
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
      };
      reader.readAsDataURL(file);
    },
    [fsBinding, persistHistoryImage]
  );

  const handleUploadTarget = useCallback(
    (file: File) => handleUpload(file, "target"),
    [handleUpload]
  );
  const handleUploadRight = useCallback(
    (file: File) => handleUpload(file, "right"),
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
    (file: File, slotIndex?: number) => {
      const mode = getToolReferenceMode(activeToolId);
      const { max } = getReferenceConstraints(mode);

      // If the active tool doesn't accept references, ignore.
      if (max === 0) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const resolution = await getImageDimensions(base64);

        let newItem: HistoryItem = {
          id: uuid(),
          parentId: null,
          imageData: base64,
          toolId: "original",
          parameters: {},
          sourceStyleId: null,
          durationMs: 0,
          cost: 0,
          model: "",
          timestamp: Date.now(),
          promptUsed: "Original Upload",
          resolution,
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
      };
      reader.readAsDataURL(file);
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

  const shouldShowConnectToOpenRouterCTA = !effectiveApiKey;

  return (
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
                className="text-right leading-tight"
                title={creditsSecondaryLabel || undefined}
              >
                <span
                  className="block text-xs font-semibold uppercase tracking-wide"
                  style={{ color: theme.colors.textMuted }}
                >
                  OpenRouter Credits
                </span>
                <span
                  className="block text-sm font-bold"
                  style={{
                    color: creditsError
                      ? theme.colors.danger
                      : theme.colors.textPrimary,
                  }}
                >
                  {creditsPrimaryLabel}
                </span>
                {creditsSecondaryLabel && (
                  <span
                    className="block text-xs"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    {creditsSecondaryLabel}
                  </span>
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
  );
}
