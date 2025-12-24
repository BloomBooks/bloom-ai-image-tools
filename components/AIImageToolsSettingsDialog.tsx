import React from "react";
import { theme } from "../themes";
import { IMAGE_TOOLS_FS_IMAGES_DIR } from "../services/persistence/constants";
import { Icon, Icons } from "./Icons";
import { OpenRouterConnect } from "./OpenRouterConnect";

interface OpenRouterSectionProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  usingEnvKey: boolean;
  authMethod: "oauth" | "manual" | null;
  apiKeyPreview: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onProvideKey: (key: string) => void;
}

interface HistorySectionProps {
  isSupported: boolean;
  isLoading: boolean;
  isFolderPersistenceActive: boolean;
  directoryName: string | null;
  error: string | null;
  onEnableFolder: () => void;
  onDisableFolder: () => void;
}

interface AIImageToolsSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  openRouter: OpenRouterSectionProps;
  history: HistorySectionProps;
}

const folderPathFromName = (name: string | null) => {
  if (!name) {
    return null;
  }
  return `${name}/${IMAGE_TOOLS_FS_IMAGES_DIR}`;
};

export const AIImageToolsSettingsDialog: React.FC<
  AIImageToolsSettingsDialogProps
> = ({ isOpen, onClose, openRouter, history }) => {
  if (!isOpen) {
    return null;
  }

  const folderPath = folderPathFromName(history.directoryName);
  const historyLoadingLabel = history.isLoading ? "Working..." : undefined;

  const connectionStatus = openRouter.isAuthenticated
    ? openRouter.usingEnvKey
      ? "Using environment key"
      : openRouter.authMethod === "oauth"
      ? "Connected via OAuth"
      : "API key linked"
    : "Not connected";

  const connectionDescription = openRouter.isAuthenticated
    ? openRouter.usingEnvKey
      ? "Tools are using a temporary key supplied by the environment."
      : openRouter.authMethod === "oauth"
      ? "Signed in with OpenRouter OAuth."
      : "Using a manually provided OpenRouter API key."
    : "Connect with OpenRouter OAuth or paste a key below to start generating images.";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: theme.colors.overlayStrong }}
        onClick={onClose}
      ></div>

      <div
        className="relative mx-4 w-full max-w-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        style={{ color: theme.colors.textPrimary }}
      >
        <div
          className="rounded-3xl border shadow-2xl flex flex-col"
          style={{
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            boxShadow: theme.colors.panelShadow,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <header
            className="flex items-center justify-between gap-3 p-6 border-b"
            style={{ borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <span
                className="p-2 rounded-2xl border"
                style={{
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <Icon path={Icons.Gear} className="w-5 h-5" />
              </span>
              <div>
                <h2 id="ai-settings-title" className="text-xl font-semibold">
                  AI Image Tools settings
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings dialog"
              className="p-2 rounded-full border"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textSecondary,
              }}
            >
              <Icon path={Icons.X} className="w-4 h-4" />
            </button>
          </header>

          <div
            className="p-6 space-y-5 text-sm"
            style={{ color: theme.colors.textSecondary }}
          >
            <section
              className="rounded-2xl border p-5 space-y-4"
              aria-labelledby="openrouter-section-title"
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                color: theme.colors.textPrimary,
              }}
            >
              <div className="flex items-start gap-3">
                <Icon path={Icons.Link} className="w-5 h-5" />
                <div>
                  <p id="openrouter-section-title" className="font-semibold">
                    OpenRouter connection
                  </p>
                </div>
              </div>

              <div
                className="rounded-2xl border p-4"
                style={{
                  borderColor: theme.colors.borderMuted,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <div className="flex flex-col gap-3">
                  <div
                    className="flex items-center justify-between flex-wrap gap-2 text-xs"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    <span
                      className="font-semibold"
                      style={{ color: theme.colors.textPrimary }}
                    >
                      Status: {connectionStatus}
                    </span>
                    <span>{connectionDescription}</span>
                  </div>
                  <OpenRouterConnect
                    isAuthenticated={openRouter.isAuthenticated}
                    isLoading={openRouter.isLoading}
                    usingEnvKey={openRouter.usingEnvKey}
                    authMethod={openRouter.authMethod}
                    apiKeyPreview={openRouter.apiKeyPreview}
                    onConnect={openRouter.onConnect}
                    onDisconnect={openRouter.onDisconnect}
                    onProvideKey={openRouter.onProvideKey}
                  />
                  {openRouter.usingEnvKey && (
                    <p
                      className="text-xs"
                      style={{ color: theme.colors.textSecondary }}
                    >
                      This environment-provided key cannot be edited here.
                      Restart the session to switch accounts.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section
              className="rounded-2xl border p-5 space-y-4"
              aria-labelledby="history-section-title"
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                color: theme.colors.textPrimary,
              }}
            >
              <div className="flex items-start gap-3">
                <Icon path={Icons.History} className="w-5 h-5" />
                <div>
                  <p id="history-section-title" className="font-semibold">
                    History storage
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    Keep more than the recent few entries by using a folder on
                    your computer.
                  </p>
                </div>
              </div>

              {!history.isSupported && (
                <div
                  className="flex gap-3 rounded-2xl border p-4"
                  style={{
                    borderColor: theme.colors.borderMuted,
                    color: theme.colors.textPrimary,
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <Icon path={Icons.AlertTriangle} className="w-5 h-5" />
                  <div>
                    <p className="font-semibold">
                      Local folders need Chromium-based browsers
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: theme.colors.textSecondary }}
                    >
                      Try Chrome, Edge, Arc, or another Chromium browser to
                      unlock folder-backed history.
                    </p>
                  </div>
                </div>
              )}

              {history.isFolderPersistenceActive ? (
                <div
                  className="rounded-2xl border p-4 space-y-3"
                  style={{
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    color: theme.colors.textPrimary,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div>
                      <p
                        className="text-xs"
                        style={{ color: theme.colors.textSecondary }}
                      >
                        Images are written to{" "}
                        <span className="font-mono text-xs">
                          {folderPath || "your folder"}
                        </span>
                        .
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void history.onDisableFolder()}
                      disabled={history.isLoading}
                      className="px-4 py-2 rounded-full text-sm font-semibold border disabled:opacity-70"
                      style={{
                        borderColor: theme.colors.border,
                        color: theme.colors.textPrimary,
                        backgroundColor: theme.colors.surfaceAlt,
                      }}
                    >
                      {historyLoadingLabel || "Stop storing history in folder"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void history.onEnableFolder()}
                  disabled={history.isLoading || !history.isSupported}
                  className="px-4 py-2 rounded-full text-sm font-semibold border disabled:opacity-70"
                  style={{
                    borderColor: theme.colors.accent,
                    color: theme.colors.textPrimary,
                    backgroundColor: theme.colors.accent,
                  }}
                >
                  {historyLoadingLabel || "Choose folder"}
                </button>
              )}

              {history.error && (
                <p
                  className="text-xs font-semibold"
                  style={{ color: "#ef4444" }}
                  role="alert"
                >
                  {history.error}
                </p>
              )}
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full text-sm font-semibold border"
                style={{
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                  backgroundColor: "transparent",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
