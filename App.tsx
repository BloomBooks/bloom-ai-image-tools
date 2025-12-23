import React, { useState, useEffect } from "react";
import { AppState, HistoryItem } from "./types";
import { ImageToolsPanel } from "./components/ImageToolsPanel";
import { editImage } from "./services/openRouterService";
import { TOOLS } from "./tools/registry";
import { theme } from "./themes";
import { OpenRouterConnect } from "./components/OpenRouterConnect";
import { handleOAuthCallback, initiateOAuthFlow } from "./lib/openRouterOAuth";
import modelCatalog from "./data/models.json";
import { ModelChooserDialog, ModelInfo } from "./components/ModelChooserDialog";

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

const API_KEY_STORAGE_KEY = "openrouter.apiKey";
// Only use the E2E test key - this should only be set during Playwright tests
const ENV_API_KEY = (process.env.E2E_OPENROUTER_API_KEY || "").trim();
const MODEL_CATALOG: ModelInfo[] = (modelCatalog as ModelInfo[]) || [];
const DEFAULT_MODEL =
  MODEL_CATALOG.find((model) => model.default) || MODEL_CATALOG[0] || null;

export default function App() {
  const [state, setState] = useState<AppState>({
    leftPanelImageId: null,
    rightPanelImageId: null,
    history: [],
    isProcessing: false,
    isAuthenticated: false,
    error: null,
  });

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"oauth" | "manual" | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    DEFAULT_MODEL?.id || ""
  );
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const selectedModel =
    MODEL_CATALOG.find((model) => model.id === selectedModelId) ||
    DEFAULT_MODEL;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    const storedMethod = localStorage.getItem("openrouter.authMethod") as
      | "oauth"
      | "manual"
      | null;
    if (storedKey) {
      setApiKey(storedKey);
      setAuthMethod(storedMethod);
    } else if (ENV_API_KEY) {
      setState((prev) => ({ ...prev, isAuthenticated: true }));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
      if (authMethod) {
        localStorage.setItem("openrouter.authMethod", authMethod);
      }
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem("openrouter.authMethod");
    }
    setState((prev) => ({
      ...prev,
      isAuthenticated: !!(apiKey || ENV_API_KEY),
    }));
  }, [apiKey, authMethod]);

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

    // Check requirements: If tool requires image, we must have one.
    // If it doesn't (New Image), we can have one (Reference) or not.
    if (tool.requiresImage !== false && !state.leftPanelImageId) {
      setState((prev) => ({
        ...prev,
        error:
          "Please select a source image for this tool (drag from history or upload).",
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
      const leftItem = state.history.find(
        (h) => h.id === state.leftPanelImageId
      );
      const prompt = tool.promptTemplate(params);

      // Always use the left item if it exists, even for "New Image" (acts as reference)
      const sourceImage = leftItem ? leftItem.imageData : null;

      const effectiveApiKey = apiKey || ENV_API_KEY;
      if (!effectiveApiKey) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          error: "Connect to OpenRouter before running tools.",
        }));
        return;
      }

      const result = await editImage(
        sourceImage,
        prompt,
        effectiveApiKey,
        selectedModel?.id
      );

      const resolution = await getImageDimensions(result.imageData);

      const newItem: HistoryItem = {
        id: uuid(),
        parentId: leftItem ? leftItem.id : null,
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

  const handleUpload = (file: File, targetPanel: "left" | "right") => {
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
        leftPanelImageId:
          targetPanel === "left" ? newItem.id : prev.leftPanelImageId,
        rightPanelImageId:
          targetPanel === "right" ? newItem.id : prev.rightPanelImageId,
      }));
    };
    reader.readAsDataURL(file);
  };

  // Global Paste Listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Check if the paste event contains files (images)
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        // Only intercept images
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          handleUpload(file, "left");
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []); // handleUpload is stable in this context or we can ignore dep warning for this simplicity

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
    setState((prev) => ({ ...prev, isAuthenticated: !!ENV_API_KEY }));
  };

  const handleProvideKey = (key: string) => {
    setApiKey(key);
    setAuthMethod("manual");
  };

  const handleSetLeftPanel = (id: string) => {
    setState((prev) => ({
      ...prev,
      leftPanelImageId: id,
      rightPanelImageId:
        prev.rightPanelImageId === id ? null : prev.rightPanelImageId,
    }));
  };

  const handleSetRightPanel = (id: string) => {
    setState((prev) => ({ ...prev, rightPanelImageId: id }));
  };

  const handleClearLeftPanel = () => {
    setState((prev) => ({ ...prev, leftPanelImageId: null }));
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
      leftPanelImageId:
        prev.leftPanelImageId === id ? null : prev.leftPanelImageId,
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

  const leftItem =
    state.history.find((h) => h.id === state.leftPanelImageId) || null;
  const rightItem =
    state.history.find((h) => h.id === state.rightPanelImageId) || null;

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
          <h1 className="text-lg font-bold bg-clip-text ">
            Bloom AI Image Tools
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <OpenRouterConnect
            isAuthenticated={state.isAuthenticated}
            isLoading={authLoading}
            usingEnvKey={!!(ENV_API_KEY && !apiKey)}
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
        leftImage={leftItem}
        rightImage={rightItem}
        activeToolId={activeToolId}
        onApplyTool={handleApplyTool}
        onToolSelect={(id) => setActiveToolId(id)}
        onSetLeft={handleSetLeftPanel}
        onSetRight={handleSetRightPanel}
        onClearLeft={handleClearLeftPanel}
        onClearRight={handleClearRightPanel}
        onUploadLeft={(file) => handleUpload(file, "left")}
        onUploadRight={(file) => handleUpload(file, "right")}
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
