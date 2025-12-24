import React, { useEffect, useState } from "react";
import { theme } from "../themes";

type ConnectionMode = "disconnected" | "apiKey" | "oauth";

type OptionText = { active: string; inactive: string };

interface OpenRouterConnectProps {
  isAuthenticated: boolean;
  isLoading: boolean;
  usingEnvKey: boolean;
  authMethod: "oauth" | "manual" | null;
  apiKeyPreview: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onProvideKey: (key: string) => void;
}

export function OpenRouterConnect({
  isAuthenticated,
  isLoading,
  usingEnvKey,
  authMethod,
  apiKeyPreview,
  onConnect,
  onDisconnect,
  onProvideKey,
}: OpenRouterConnectProps) {
  const [keyValue, setKeyValue] = useState(() => apiKeyPreview || "");

  useEffect(() => {
    setKeyValue(apiKeyPreview ?? "");
  }, [apiKeyPreview]);

  const hasOAuthConnection = authMethod === "oauth" && isAuthenticated;
  const hasManualKey = authMethod === "manual" && Boolean(apiKeyPreview);
  const hasEnvKey = usingEnvKey;
  const hasApiKey = (hasEnvKey || hasManualKey) && !hasOAuthConnection;

  const connectionMode: ConnectionMode = hasOAuthConnection
    ? "oauth"
    : hasApiKey
    ? "apiKey"
    : "disconnected";

  const handleDisconnect = () => {
    onDisconnect();
    setKeyValue("");
  };

  const handleKeyBlur = () => {
    if (usingEnvKey || connectionMode === "oauth") {
      return;
    }
    const trimmed = keyValue.trim();
    if (!trimmed) {
      handleDisconnect();
      return;
    }
    const previewTrimmed = (apiKeyPreview ?? "").trim();
    if (trimmed !== previewTrimmed) {
      onProvideKey(trimmed);
    }
    if (trimmed !== keyValue) {
      setKeyValue(trimmed);
    }
  };

  const renderOptionCard = (
    value: ConnectionMode,
    labels: OptionText,
    description: OptionText,
    content: React.ReactNode,
    testId: string,
    containerStyle: React.CSSProperties = {}
  ) => (
    <div
      key={value}
      className="rounded-2xl border p-4 flex flex-col gap-3"
      style={{
        borderColor:
          connectionMode === value ? theme.colors.accent : theme.colors.border,
        backgroundColor:
          connectionMode === value
            ? theme.colors.surfaceAlt
            : theme.colors.surface,
        ...containerStyle,
      }}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="openrouter-connection-mode"
          id={`openrouter-${value}`}
          checked={connectionMode === value}
          readOnly
          data-testid={testId}
          className="sr-only"
          style={{ accentColor: theme.colors.accent }}
        />
        <div>
          <label
            htmlFor={`openrouter-${value}`}
            className="font-semibold"
            style={{ color: theme.colors.textPrimary }}
          >
            {connectionMode === value ? labels.active : labels.inactive}
          </label>
          <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
            {connectionMode === value
              ? description.active
              : description.inactive}
          </p>
        </div>
      </div>
      <div className="pl-7 text-sm" style={{ color: theme.colors.textPrimary }}>
        {content}
      </div>
    </div>
  );

  const oauthButtonLabel =
    connectionMode === "oauth" ? "Disconnect" : "Connect";
  const oauthButtonAction =
    connectionMode === "oauth" ? handleDisconnect : onConnect;
  const oauthButtonTestId =
    connectionMode === "oauth"
      ? "openrouter-oauth-disconnect"
      : "openrouter-oauth-connect";

  const apiKeyDescriptions: OptionText = usingEnvKey
    ? {
        active: "An environment variable is supplying the OpenRouter key.",
        inactive: "This environment already provides an OpenRouter key.",
      }
    : {
        active: "",
        inactive: "",
      };

  const oauthDescriptions: OptionText = {
    active: "You are logged in via OpenRouter OAuth with this browser.",
    inactive: "",
  };

  return (
    <fieldset
      className="flex flex-col gap-4"
      aria-label="OpenRouter connection"
    >
      <div>
        OpenRouter credits are how you pre-pay for use of the AI Image Tools
        from Google and others. Once you have an OpenRouter account, you can
        either connect to it via login or paste in an API key.
      </div>

      {renderOptionCard(
        "apiKey",
        {
          active: "Connected with OpenRouter API key",
          inactive: "Connect with OpenRouter API key",
        },
        apiKeyDescriptions,
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              data-testid="openrouter-api-key-input"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              onBlur={handleKeyBlur}
              placeholder="Paste OpenRouter key"
              disabled={usingEnvKey || connectionMode === "oauth"}
              className="px-3 py-2 rounded-lg text-sm outline-none flex-1"
              style={{
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.textPrimary,
                minWidth: "220px",
              }}
            />
            {hasManualKey && !usingEnvKey && (
              <button
                type="button"
                data-testid="openrouter-clear-key"
                onClick={handleDisconnect}
                disabled={connectionMode === "oauth"}
                className="px-4 py-2 rounded-lg text-sm font-semibold border"
                style={{
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.surface,
                  opacity: connectionMode === "oauth" ? 0.5 : 1,
                }}
              >
                Clear key
              </button>
            )}
          </div>

          {usingEnvKey && (
            <p
              className="text-xs"
              style={{ color: theme.colors.textSecondary }}
            >
              This key is provided by the environment and cannot be changed in
              this interface.
            </p>
          )}
        </div>,
        "openrouter-option-api-key",
        connectionMode === "oauth"
          ? { opacity: 0.3, pointerEvents: "none" }
          : {}
      )}

      {renderOptionCard(
        "oauth",
        {
          active: "Logged in with OpenRouter",
          inactive: "Connect with OpenRouter login",
        },
        oauthDescriptions,
        <button
          type="button"
          data-testid={oauthButtonTestId}
          onClick={oauthButtonAction}
          disabled={isLoading}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.textPrimary,
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? "Working..." : oauthButtonLabel}
        </button>,
        "openrouter-option-oauth"
      )}
    </fieldset>
  );
}
