import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AppState,
  HistoryItem,
  ModelInfo,
  PersistedAppState,
  ToolParamsById,
} from "./types";
import { ImageToolsPanel } from "./components/ImageToolsPanel";
import { editImage } from "./services/openRouterService";
import { TOOLS } from "./tools/tools-registry";
import { theme } from "./themes";
import { OpenRouterConnect } from "./components/OpenRouterConnect";
import { handleOAuthCallback, initiateOAuthFlow } from "./lib/openRouterOAuth";
import JSON5 from "json5";
import modelCatalogText from "./data/models-registry.json5?raw";
import { ModelChooserDialog } from "./components/ModelChooserDialog";
import bloomLogo from "./assets/bloom.svg";
import {
  createToolParamDefaults,
  mergeParamsWithDefaults,
} from "./lib/toolParams";
import { ENV_KEY_SKIP_FLAG } from "./lib/authFlags";
import {
  API_KEY_STORAGE_KEY,
  AUTH_METHOD_STORAGE_KEY,
} from "./lib/authStorage";
import { createBrowserImageToolsPersistence } from "./services/persistence/browserPersistence";
import { IMAGE_TOOLS_STATE_VERSION } from "./services/persistence/constants";

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
  const idSet = new Set(history.map((item) => item.id));

  const normalizeId = (id: string | null) => (id && idSet.has(id) ? id : null);
  const referenceImageIds = Array.isArray(persisted?.referenceImageIds)
    ? (persisted?.referenceImageIds as string[]).filter((id) => idSet.has(id))
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

  const [paramsByTool, setParamsByTool] = useState<ToolParamsById>(
    () => createToolParamDefaults()
  );
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"oauth" | "manual" | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    DEFAULT_MODEL?.id || ""
  );
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const persistence = useMemo(
    () => createBrowserImageToolsPersistence(),
    []
  );
  const selectedModel =
    MODEL_CATALOG.find((model) => model.id === selectedModelId) ||
    DEFAULT_MODEL;
  const envApiKey = getEnvApiKey();

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

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isAuthenticated: !!(apiKey || envApiKey),
    }));
  }, [apiKey, envApiKey]);

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
            MODEL_CATALOG.some((model) => model.id === persisted.selectedModelId)
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

  const persistableState = useMemo(
    () => ({
      version: IMAGE_TOOLS_STATE_VERSION,
      appState: {
        targetImageId: state.targetImageId,
        referenceImageIds: state.referenceImageIds,
        rightPanelImageId: state.rightPanelImageId,
        history: state.history,
      },
      paramsByTool,
      activeToolId,
      selectedModelId: selectedModelId || null,
      auth: {
        apiKey,
        authMethod,
      },
    }),
    [
      state.targetImageId,
      state.referenceImageIds,
      state.rightPanelImageId,
      state.history,
      paramsByTool,
      activeToolId,
      selectedModelId,
      apiKey,
      authMethod,
    ]
  );

  useEffect(() => {
    if (!isHydrated) return;
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

  const handleApplyTool = async (
    toolId: string,
    params: Record<string, string>
  ) => {
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

    const requiresEditImage = tool.editImage !== false;
    const targetImage = requiresEditImage && state.targetImageId
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

    try {
      const basePrompt = tool.promptTemplate(params);

      const constrainedReferences = referenceItems.slice(0, max);
      const sourceImages = [
        ...(requiresEditImage && targetImage ? [targetImage.imageData] : []),
        ...constrainedReferences.map((h) => h.imageData),
      ];

      const prompt =
        tool.id === "custom"
          ? `Edit the first image. If more images are provided, treat them as style/"like this" references.\n\nInstructions:\n${basePrompt}`
          : basePrompt;

      const effectiveApiKey = apiKey || envApiKey;
      if (!effectiveApiKey) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: "Connect to OpenRouter before running tools.",
        }));
        return;
      }

      // In E2E, we authenticate via an env key. In that mode we want the model
      // to be controlled by VITE_OPENROUTER_IMAGE_MODEL (from the dev server env)
      // rather than whatever the UI's default model happens to be.
      const modelIdForRequest = envApiKey && !apiKey ? undefined : selectedModel?.id;

      const result = await editImage(
        sourceImages,
        prompt,
        effectiveApiKey,
        modelIdForRequest
      );

      const resolution = await getImageDimensions(result.imageData);

      const newItem: HistoryItem = {
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
        resolution,
      };

      setState((prev) => ({
        ...prev,
        history: [...prev.history, newItem],
        rightPanelImageId: newItem.id, // Result goes to right panel
        isProcessing: false,
      }));
    } catch (error) {
      console.error("Failed to apply tool:", error);
      const message =
        error instanceof Error ? error.message : "Failed to process image.";
      setState((prev) => ({ ...prev, isProcessing: false, error: message }));
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
      const newItem: HistoryItem = {
        id: uuid(),
        parentId: null,
        imageData: base64,
        toolId: "original",
        parameters: {},
        durationMs: 0,
        cost: 0,
        model: "",
        timestamp: Date.now(),
        promptUsed: "Original Upload",
        resolution,
      };

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
    []
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

      const newItem: HistoryItem = {
        id: uuid(),
        parentId: null,
        imageData: base64,
        toolId: "original",
        parameters: {},
        durationMs: 0,
        cost: 0,
        model: "",
        timestamp: Date.now(),
        promptUsed: "Original Upload",
        resolution,
      };

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
    [activeToolId]
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
    setApiKey(key);
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

  const targetImage =
    state.targetImageId
      ? state.history.find((h) => h.id === state.targetImageId) || null
      : null;

  const referenceItems = state.referenceImageIds
    .map((id) => state.history.find((h) => h.id === id) || null)
    .filter((h): h is HistoryItem => !!h);
  const rightItem =
    state.history.find((h) => h.id === state.rightPanelImageId) || null;

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
          <img
            src={bloomLogo}
            alt="Bloom"
            className="h-7 w-7"
          />
          <h1 className="text-lg font-bold bg-clip-text ">
            Bloom AI Image Tools
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <OpenRouterConnect
            isAuthenticated={state.isAuthenticated}
            isLoading={authLoading}
            usingEnvKey={!!(envApiKey && !apiKey)}
            authMethod={authMethod}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onProvideKey={handleProvideKey}
          />
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
        onApplyTool={handleApplyTool}
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
