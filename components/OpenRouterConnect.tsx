import React, { useState } from "react";
import { Icon, Icons } from "./Icons";
import { theme } from "../themes";

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
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyValue, setKeyValue] = useState("");

  const obfuscateKey = (key: string | null) => {
    if (!key) {
      return null;
    }
    const prefix = key.slice(0, 4);
    const hiddenLength = Math.max(key.length - 4, 0);
    const suffix = hiddenLength > 0 ? "*".repeat(hiddenLength) : "";
    return `${prefix}${suffix}`;
  };

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyValue.trim()) {
      onProvideKey(keyValue.trim());
      setKeyValue("");
      setShowKeyInput(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
    setShowKeyInput(false);
    setKeyValue("");
  };

  const statusLabel = (() => {
    if (usingEnvKey) return "Using OpenRouter key (env)";
    if (authMethod === "manual") return "Using stored OpenRouter key";
    return "Connected to OpenRouter";
  })();
  const keyPreview =
    (usingEnvKey || authMethod === "manual") && apiKeyPreview
      ? obfuscateKey(apiKeyPreview)
      : null;

  // When authenticated, show disconnect link
  if (isAuthenticated) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <p
            data-testid="openrouter-status"
            className="font-semibold"
            style={{ color: theme.colors.textPrimary }}
          >
            {statusLabel}
          </p>
          {keyPreview && (
            <span
              className="inline-flex items-center rounded-xl border px-4 py-1 font-mono text-xs"
              style={{
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceAlt,
                color: theme.colors.textPrimary,
              }}
              aria-label="Active OpenRouter key"
            >
              {keyPreview}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {authMethod === "manual" && !usingEnvKey && (
            <button
              type="button"
              data-testid="openrouter-clear-key"
              onClick={handleDisconnect}
              className="px-4 py-2 rounded-full text-sm font-semibold border"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surface,
              }}
            >
              Clear key
            </button>
          )}
          {authMethod === "oauth" && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-4 py-2 rounded-full text-sm font-semibold border"
              style={{
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
                backgroundColor: theme.colors.surface,
              }}
            >
              Disconnect
            </button>
          )}
        </div>
        {usingEnvKey && (
          <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
            This environment-provided key cannot be edited here. Restart the
            session to switch accounts.
          </p>
        )}
      </div>
    );
  }

  // When not authenticated, show two options
  if (showKeyInput) {
    return (
      <form onSubmit={handleKeySubmit} className="flex items-center gap-2">
        <input
          type="password"
          data-testid="openrouter-key-input"
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          placeholder="Enter OpenRouter API key"
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.textPrimary,
            width: "220px",
          }}
          autoFocus
        />
        <button
          type="submit"
          data-testid="openrouter-key-submit"
          disabled={!keyValue.trim()}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: theme.colors.accent,
            color: theme.colors.textPrimary,
            opacity: keyValue.trim() ? 1 : 0.5,
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setShowKeyInput(false);
            setKeyValue("");
          }}
          className="px-2 py-2 rounded-lg text-sm transition-all"
          style={{ color: theme.colors.textMuted }}
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        data-testid="openrouter-connect"
        onClick={onConnect}
        disabled={isLoading}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
        style={{
          backgroundColor: theme.colors.accent,
          color: theme.colors.textPrimary,
          boxShadow: theme.colors.accentShadow,
          opacity: isLoading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = theme.colors.accentHover;
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = theme.colors.accent;
          }
        }}
        title="Connect using OpenRouter OAuth"
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
        ) : (
          <Icon path={Icons.Link} className="w-4 h-4" />
        )}
        Connect to OpenRouter
      </button>
      <button
        data-testid="openrouter-provide-key"
        onClick={() => setShowKeyInput(true)}
        disabled={isLoading}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 border"
        style={{
          backgroundColor: "transparent",
          color: theme.colors.textSecondary,
          borderColor: theme.colors.border,
          opacity: isLoading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.surfaceAlt;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        title="Manually enter an OpenRouter API key"
      >
        Provide OpenRouter Key
      </button>
    </div>
  );
}
